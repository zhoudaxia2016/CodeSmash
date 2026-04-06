import type { Client } from '@libsql/client'

export const BATTLE_LLM_PROVIDERS = ['minimax', 'deepseek'] as const
export type BattleLlmProvider = (typeof BATTLE_LLM_PROVIDERS)[number]

export type ModelRow = {
  id: string
  name: string
  description: string
  provider: string
  enabled: boolean
  sortOrder: number
  createdAt: string
}

function rowToModel(r: Record<string, unknown>): ModelRow {
  return {
    id: String(r.id),
    name: String(r.name),
    description: r.description == null ? '' : String(r.description),
    provider: String(r.provider),
    enabled: Number(r.enabled) !== 0,
    sortOrder: Number(r.sort_order),
    createdAt: String(r.created_at),
  }
}

export function isBattleLlmProvider(p: string): p is BattleLlmProvider {
  return (BATTLE_LLM_PROVIDERS as readonly string[]).includes(p)
}

const SEED_MODELS: Array<
  Pick<ModelRow, 'id' | 'name' | 'description' | 'provider' | 'sortOrder'>
> = [
  {
    id: 'minimax-2.7',
    name: 'MiniMax 2.7',
    description: 'MiniMax 最新编程模型，代码能力强',
    provider: 'minimax',
    sortOrder: 0,
  },
  {
    id: 'deepseek-v3',
    name: 'DeepSeek V3',
    description: 'DeepSeek 最新模型',
    provider: 'deepseek',
    sortOrder: 1,
  },
]

export async function seedModelsIfEmpty(client: Client): Promise<void> {
  const cnt = await client.execute({ sql: 'SELECT COUNT(*) AS n FROM models', args: [] })
  const n = Number((cnt.rows[0] as Record<string, unknown>).n)
  if (n > 0) return
  const now = new Date().toISOString()
  for (const m of SEED_MODELS) {
    await client.execute({
      sql: `INSERT INTO models (id, name, description, provider, enabled, sort_order, created_at)
            VALUES (?, ?, ?, ?, 1, ?, ?)`,
      args: [m.id, m.name, m.description, m.provider, m.sortOrder, now],
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
      ? 'SELECT id, name, description, provider, enabled, sort_order, created_at FROM models WHERE enabled = 1 ORDER BY sort_order ASC, id ASC'
      : 'SELECT id, name, description, provider, enabled, sort_order, created_at FROM models ORDER BY sort_order ASC, id ASC',
    args: [],
  })
  return res.rows.map((row) => rowToModel(row as Record<string, unknown>))
}

export async function getModelById(client: Client, id: string): Promise<ModelRow | null> {
  const res = await client.execute({
    sql:
      'SELECT id, name, description, provider, enabled, sort_order, created_at FROM models WHERE id = ?',
    args: [id],
  })
  if (res.rows.length === 0) return null
  return rowToModel(res.rows[0] as Record<string, unknown>)
}

/** Provider for an enabled model; null if missing, disabled, or unknown provider. */
export async function getProviderForEnabledModel(
  client: Client,
  modelId: string,
): Promise<BattleLlmProvider | null> {
  const m = await getModelById(client, modelId)
  if (!m || !m.enabled) return null
  if (!isBattleLlmProvider(m.provider)) return null
  return m.provider
}

export async function insertModel(
  client: Client,
  input: {
    id: string
    name: string
    description: string
    provider: BattleLlmProvider
    enabled?: boolean
    sortOrder?: number
  },
): Promise<ModelRow> {
  const now = new Date().toISOString()
  const enabled = input.enabled !== false ? 1 : 0
  const sortOrder = input.sortOrder ?? 0
  await client.execute({
    sql: `INSERT INTO models (id, name, description, provider, enabled, sort_order, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [input.id, input.name, input.description, input.provider, enabled, sortOrder, now],
  })
  const m = await getModelById(client, input.id)
  if (!m) throw new Error('insertModel: row missing after insert')
  return m
}

export async function updateModel(
  client: Client,
  id: string,
  patch: Partial<{
    name: string
    description: string
    provider: BattleLlmProvider
    enabled: boolean
    sortOrder: number
  }>,
): Promise<ModelRow | null> {
  const cur = await getModelById(client, id)
  if (!cur) return null
  const name = patch.name ?? cur.name
  const description = patch.description ?? cur.description
  const providerStr = patch.provider ?? cur.provider
  const enabled = patch.enabled !== undefined ? (patch.enabled ? 1 : 0) : (cur.enabled ? 1 : 0)
  const sortOrder = patch.sortOrder ?? cur.sortOrder
  if (!isBattleLlmProvider(providerStr)) return null
  const provider = providerStr
  await client.execute({
    sql: `UPDATE models SET name = ?, description = ?, provider = ?, enabled = ?, sort_order = ? WHERE id = ?`,
    args: [name, description, provider, enabled, sortOrder, id],
  })
  return getModelById(client, id)
}

/** Soft-disable (plan: prefer disable over delete). */
export async function disableModel(client: Client, id: string): Promise<boolean> {
  const before = await getModelById(client, id)
  if (!before) return false
  await client.execute({
    sql: 'UPDATE models SET enabled = 0 WHERE id = ?',
    args: [id],
  })
  const after = await getModelById(client, id)
  return after != null && !after.enabled
}
