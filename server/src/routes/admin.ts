import { Hono } from 'hono'
import { getLibsqlClient } from '../db/client.ts'
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

adminRouter.get('/logs', (c) => {
  return c.json({
    message: '日志管理（占位）',
    items: [] as unknown[],
  })
})

export { adminRouter }
