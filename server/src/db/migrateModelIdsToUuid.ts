import type { Client } from '@libsql/client'
import { SEED_MODEL_UUID } from './modelSeedUuids.ts'

const LEGACY_SLUG_TO_UUID: Record<string, string> = {
  'minimax-2.7': SEED_MODEL_UUID.minimax,
  'deepseek-v3': SEED_MODEL_UUID.deepseek,
}

function isUuidShape(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)
}

function patchBattlePayloadIds(obj: Record<string, unknown>, map: Record<string, string>): void {
  const rep = (v: unknown): unknown => {
    if (typeof v === 'string' && map[v]) return map[v]
    return v
  }
  if (typeof obj.modelAId === 'string' && map[obj.modelAId]) obj.modelAId = map[obj.modelAId]
  if (typeof obj.modelBId === 'string' && map[obj.modelBId]) obj.modelBId = map[obj.modelBId]
  for (const key of ['modelAResult', 'modelBResult'] as const) {
    const side = obj[key]
    if (!side || typeof side !== 'object') continue
    const s = side as Record<string, unknown>
    if (typeof s.modelId === 'string' && map[s.modelId]) s.modelId = map[s.modelId]
  }
}

/**
 * One-time style migration: slug-like `models.id` → UUID; fix `battle_results` + JSON payloads.
 * Idempotent: if all `models.id` are already UUID-shaped, no-op.
 */
export async function migrateModelIdsToUuidIfNeeded(client: Client): Promise<void> {
  const res = await client.execute({
    sql: 'SELECT id FROM models',
    args: [],
  })
  const map: Record<string, string> = {}
  for (const row of res.rows) {
    const oldId = String((row as Record<string, unknown>).id)
    if (isUuidShape(oldId)) continue
    map[oldId] = LEGACY_SLUG_TO_UUID[oldId] ?? crypto.randomUUID()
  }

  const pairs = Object.entries(map)
  if (pairs.length === 0) return

  console.log('[db] migration: model ids → UUID (%d row(s))', pairs.length)

  for (const [oldId, newId] of pairs) {
    await client.execute({
      sql: 'UPDATE battle_results SET model_a_id = ? WHERE model_a_id = ?',
      args: [newId, oldId],
    })
    await client.execute({
      sql: 'UPDATE battle_results SET model_b_id = ? WHERE model_b_id = ?',
      args: [newId, oldId],
    })
  }

  const br = await client.execute({
    sql: 'SELECT id, payload_json FROM battle_results',
    args: [],
  })
  for (const row of br.rows) {
    const id = String((row as Record<string, unknown>).id)
    const raw = String((row as Record<string, unknown>).payload_json)
    let parsed: unknown
    try {
      parsed = JSON.parse(raw) as unknown
    } catch {
      continue
    }
    if (!parsed || typeof parsed !== 'object') continue
    patchBattlePayloadIds(parsed as Record<string, unknown>, map)
    const next = JSON.stringify(parsed)
    if (next === raw) continue
    await client.execute({
      sql: 'UPDATE battle_results SET payload_json = ? WHERE id = ?',
      args: [next, id],
    })
  }

  for (const [oldId, newId] of pairs) {
    await client.execute({
      sql: 'UPDATE models SET id = ? WHERE id = ?',
      args: [newId, oldId],
    })
  }
}
