import type { Client } from '@libsql/client'
import { SEED_MODEL_UUID } from './modelSeedUuids.ts'

export const BATTLE_LLM_PROVIDERS = ['minimax', 'deepseek'] as const
export type BattleLlmProvider = (typeof BATTLE_LLM_PROVIDERS)[number]

export type ModelRow = {
  id: string
  name: string
  provider: string
  enabled: boolean
  createdAt: string
}

function rowToModel(r: Record<string, unknown>): ModelRow {
  return {
    id: String(r.id),
    name: String(r.name),
    provider: String(r.provider),
    enabled: Number(r.enabled) !== 0,
    createdAt: String(r.created_at),
  }
}

export function isBattleLlmProvider(p: string): p is BattleLlmProvider {
  return (BATTLE_LLM_PROVIDERS as readonly string[]).includes(p)
}

const SEED_MODELS: Array<Pick<ModelRow, 'id' | 'name' | 'provider'>> = [
  { id: SEED_MODEL_UUID.minimax, name: 'MiniMax-M2.7', provider: 'minimax' },
  { id: SEED_MODEL_UUID.deepseek, name: 'deepseek-chat', provider: 'deepseek' },
]

export async function seedModelsIfEmpty(client: Client): Promise<void> {
  const cnt = await client.execute({ sql: 'SELECT COUNT(*) AS n FROM models', args: [] })
  const n = Number((cnt.rows[0] as Record<string, unknown>).n)
  if (n > 0) return
  const now = new Date().toISOString()
  for (const m of SEED_MODELS) {
    await client.execute({
      sql: `INSERT INTO models (id, name, provider, enabled, created_at)
            VALUES (?, ?, ?, 1, ?)`,
      args: [m.id, m.name, m.provider, now],
    })
  }
  console.log('[db] seeded models table')
}

export async function listModels(
  client: Client,
  opts?: { enabledOnly?: boolean },
): Promise<ModelRow[]> {
  const enabledOnly = opts?.enabledOnly === true
  const res = await client.execute({
    sql: enabledOnly
      ? 'SELECT id, name, provider, enabled, created_at FROM models WHERE enabled = 1 ORDER BY created_at ASC, id ASC'
      : 'SELECT id, name, provider, enabled, created_at FROM models ORDER BY created_at ASC, id ASC',
    args: [],
  })
  return res.rows.map((row) => rowToModel(row as Record<string, unknown>))
}

export async function getModelById(client: Client, id: string): Promise<ModelRow | null> {
  const res = await client.execute({
    sql: 'SELECT id, name, provider, enabled, created_at FROM models WHERE id = ?',
    args: [id],
  })
  if (res.rows.length === 0) return null
  return rowToModel(res.rows[0] as Record<string, unknown>)
}

export async function getBattleLlmConfig(
  client: Client,
  modelId: string,
): Promise<{ provider: BattleLlmProvider; model: string } | null> {
  const m = await getModelById(client, modelId)
  if (!m || !m.enabled) return null
  if (!isBattleLlmProvider(m.provider)) return null
  if (!m.name) return null
  return { provider: m.provider, model: m.name }
}

export async function insertModel(
  client: Client,
  input: {
    name: string
    provider: BattleLlmProvider
    enabled?: boolean
  },
): Promise<ModelRow> {
  const name = input.name.trim()
  if (!name) throw new Error('name required')

  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  const enabled = input.enabled !== false ? 1 : 0
  await client.execute({
    sql: `INSERT INTO models (id, name, provider, enabled, created_at)
          VALUES (?, ?, ?, ?, ?)`,
    args: [id, name, input.provider, enabled, now],
  })
  const m = await getModelById(client, id)
  if (!m) throw new Error('insertModel: row missing after insert')
  return m
}

export async function updateModel(
  client: Client,
  id: string,
  patch: Partial<{
    provider: BattleLlmProvider
    enabled: boolean
  }>,
): Promise<ModelRow | null> {
  const cur = await getModelById(client, id)
  if (!cur) return null
  const providerStr = patch.provider ?? cur.provider
  const enabled = patch.enabled !== undefined ? (patch.enabled ? 1 : 0) : (cur.enabled ? 1 : 0)
  if (!isBattleLlmProvider(providerStr)) return null
  const provider = providerStr
  await client.execute({
    sql: `UPDATE models SET provider = ?, enabled = ? WHERE id = ?`,
    args: [provider, enabled, id],
  })
  return getModelById(client, id)
}

export async function deleteModelPermanently(client: Client, id: string): Promise<boolean> {
  const before = await getModelById(client, id)
  if (!before) return false
  await client.execute({
    sql: 'DELETE FROM models WHERE id = ?',
    args: [id],
  })
  return true
}
