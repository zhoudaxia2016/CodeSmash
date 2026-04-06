import { Hono } from 'hono'
import { getLibsqlClient } from '../db/client.ts'
import {
  countLlmCallLogs,
  deriveAdminLastMessageCell,
  deriveAdminOutputContentCell,
  getLlmCallLogById,
  listLlmCallLogsForAdmin,
  LLM_CALL_LOG_ADMIN_CELL_MAX,
  LLM_CALL_SOURCE_VALUES,
} from '../db/llmCallLog.ts'
import {
  BATTLE_LLM_PROVIDERS,
  deleteModelPermanently,
  getModelById,
  insertModel,
  isBattleLlmProvider,
  listModels,
  updateModel,
} from '../db/modelsRepo.ts'
import { assertVendorModelNameAllowed } from '../lib/llm.ts'
import type { SessionUser } from '../db/userSessionsRepo.ts'
import { requireAdmin } from '../middleware/requireAdmin.ts'

const adminRouter = new Hono<{ Variables: { user?: SessionUser } }>()

adminRouter.use('*', requireAdmin)

function adminModelJson(m: Awaited<ReturnType<typeof listModels>>[number]) {
  return {
    id: m.id,
    name: m.name,
    provider: m.provider,
    enabled: m.enabled,
    createdAt: m.createdAt,
  }
}

adminRouter.get('/models', async (c) => {
  const client = getLibsqlClient()
  const models = await listModels(client)
  return c.json({ models: models.map(adminModelJson) })
})

adminRouter.post('/models', async (c) => {
  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body || typeof body !== 'object') {
    return c.json({ error: 'JSON body required' }, 400)
  }
  const name = typeof body.name === 'string' ? body.name : ''
  const providerRaw = body.provider

  if (!name.trim()) {
    return c.json({ error: 'name is required' }, 400)
  }
  if (typeof providerRaw !== 'string' || !isBattleLlmProvider(providerRaw)) {
    return c.json({ error: `provider must be one of: ${BATTLE_LLM_PROVIDERS.join(', ')}` }, 400)
  }

  const enabled = body.enabled !== false

  const client = getLibsqlClient()

  const probe = await assertVendorModelNameAllowed(providerRaw, name.trim())
  if (!probe.ok) {
    return c.json({ error: probe.error, message: probe.error }, 400)
  }

  let created
  try {
    created = await insertModel(client, {
      name,
      provider: providerRaw,
      enabled,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to create model'
    if (msg === 'name required') {
      return c.json({ error: msg, message: msg }, 400)
    }
    console.error('[admin] insert model', e)
    return c.json({ error: 'Failed to create model' }, 500)
  }

  return c.json({ model: adminModelJson(created) }, 201)
})

adminRouter.patch('/models/:id', async (c) => {
  const id = c.req.param('id')
  if (!id) return c.json({ error: 'id required' }, 400)

  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body || typeof body !== 'object') {
    return c.json({ error: 'JSON body required' }, 400)
  }

  const patch: Parameters<typeof updateModel>[2] = {}
  if (body.enabled !== undefined) patch.enabled = Boolean(body.enabled)
  if (body.provider !== undefined) {
    if (typeof body.provider !== 'string' || !isBattleLlmProvider(body.provider)) {
      return c.json({ error: `provider must be one of: ${BATTLE_LLM_PROVIDERS.join(', ')}` }, 400)
    }
    patch.provider = body.provider
  }

  if (Object.keys(patch).length === 0) {
    return c.json({ error: 'No valid fields to update' }, 400)
  }

  const client = getLibsqlClient()
  const existing = await getModelById(client, id)
  if (!existing) {
    return c.json({ error: 'Model not found' }, 404)
  }

  if (patch.provider !== undefined) {
    const nextProvider = patch.provider
    const probe = await assertVendorModelNameAllowed(nextProvider, existing.name)
    if (!probe.ok) {
      return c.json({ error: probe.error, message: probe.error }, 400)
    }
  }

  const updated = await updateModel(client, id, patch)
  if (!updated) {
    return c.json({ error: 'Model not found or invalid provider' }, 400)
  }
  return c.json({ model: adminModelJson(updated) })
})

adminRouter.delete('/models/:id', async (c) => {
  const id = c.req.param('id')
  if (!id) return c.json({ error: 'id required' }, 400)
  const client = getLibsqlClient()
  const ok = await deleteModelPermanently(client, id)
  if (!ok) return c.json({ error: 'Model not found' }, 404)
  return c.json({ ok: true })
})

function parseAdminLogsQuery(c: { req: { query: (k: string) => string | undefined } }) {
  const type = (c.req.query('type') ?? 'llm_call').trim()
  const limitRaw = c.req.query('limit')
  const offsetRaw = c.req.query('offset')
  const limit = limitRaw != null && limitRaw !== '' ? Number(limitRaw) : 50
  const offset = offsetRaw != null && offsetRaw !== '' ? Number(offsetRaw) : 0
  return {
    type,
    filters: {
      createdFrom: c.req.query('from')?.trim() || undefined,
      createdTo: c.req.query('to')?.trim() || undefined,
      source: c.req.query('source')?.trim() || undefined,
      sourceIdContains: c.req.query('source_id')?.trim() || undefined,
      provider: c.req.query('provider')?.trim() || undefined,
      modelContains: c.req.query('model')?.trim() || undefined,
      messagesContains: c.req.query('q_messages')?.trim() || undefined,
      outputContains: c.req.query('q_output')?.trim() || undefined,
      limit: Number.isFinite(limit) ? limit : 50,
      offset: Number.isFinite(offset) ? offset : 0,
    },
  }
}

adminRouter.get('/logs/llm-call/:id', async (c) => {
  const id = c.req.param('id')
  if (!id) return c.json({ error: 'id required' }, 400)
  const client = getLibsqlClient()
  const row = await getLlmCallLogById(client, id)
  if (!row) return c.json({ error: 'Not found' }, 404)
  return c.json({
    type: 'llm_call',
    item: {
      id: row.id,
      createdAt: row.created_at,
      completedAt: row.completed_at,
      source: row.source,
      sourceId: row.source_id,
      provider: row.provider,
      model: row.model,
      messages: row.messages,
      outputJson: row.output_json,
      error: row.error,
      durationMs: row.duration_ms,
    },
  })
})

adminRouter.get('/logs', async (c) => {
  const { type, filters } = parseAdminLogsQuery(c)
  if (type !== 'llm_call') {
    return c.json({
      type,
      supportedTypes: ['llm_call'],
      total: 0,
      items: [],
      meta: { llmSources: [...LLM_CALL_SOURCE_VALUES], llmProviders: [...BATTLE_LLM_PROVIDERS] },
    })
  }

  const client = getLibsqlClient()
  const [total, rows] = await Promise.all([
    countLlmCallLogs(client, filters),
    listLlmCallLogsForAdmin(client, filters),
  ])

  return c.json({
    type: 'llm_call',
    supportedTypes: ['llm_call'],
    total,
    meta: { llmSources: [...LLM_CALL_SOURCE_VALUES], llmProviders: [...BATTLE_LLM_PROVIDERS] },
    items: rows.map((r) => ({
      id: r.id,
      createdAt: r.created_at,
      completedAt: r.completed_at,
      source: r.source,
      sourceId: r.source_id,
      provider: r.provider,
      model: r.model,
      lastMessageCell: deriveAdminLastMessageCell(r.messages, LLM_CALL_LOG_ADMIN_CELL_MAX),
      outputContentCell: deriveAdminOutputContentCell(r.output_json, LLM_CALL_LOG_ADMIN_CELL_MAX),
      hasOutputJson: r.output_json != null && String(r.output_json).trim() !== '',
      error: r.error,
      durationMs: r.duration_ms,
    })),
  })
})

export { adminRouter }
