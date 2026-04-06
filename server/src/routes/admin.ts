import { Hono } from 'hono'
import { getLibsqlClient } from '../db/client.ts'
import {
  disableModel,
  getModelById,
  insertModel,
  isBattleLlmProvider,
  listModels,
  updateModel,
} from '../db/modelsRepo.ts'
import type { SessionUser } from '../db/userSessionsRepo.ts'
import { requireAdmin } from '../middleware/requireAdmin.ts'

const adminRouter = new Hono<{ Variables: { user?: SessionUser } }>()

adminRouter.use('*', requireAdmin)

const MODEL_ID_RE = /^[a-zA-Z0-9._-]+$/

function adminModelJson(m: Awaited<ReturnType<typeof listModels>>[number]) {
  return {
    id: m.id,
    name: m.name,
    description: m.description,
    provider: m.provider,
    enabled: m.enabled,
    sortOrder: m.sortOrder,
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
  const id = typeof body.id === 'string' ? body.id.trim() : ''
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const description = typeof body.description === 'string' ? body.description : ''
  const providerRaw = body.provider

  if (!id || !MODEL_ID_RE.test(id)) {
    return c.json({ error: 'Invalid or missing id' }, 400)
  }
  if (!name) {
    return c.json({ error: 'name is required' }, 400)
  }
  if (typeof providerRaw !== 'string' || !isBattleLlmProvider(providerRaw)) {
    return c.json({ error: 'provider must be minimax or deepseek' }, 400)
  }

  const sortN = Number(body.sortOrder)
  const sortOrder = Number.isFinite(sortN) ? Math.floor(sortN) : 0
  const enabled = body.enabled !== false

  const client = getLibsqlClient()
  const existing = await getModelById(client, id)
  if (existing) {
    return c.json({ error: 'Model id already exists' }, 409)
  }

  try {
    await insertModel(client, {
      id,
      name,
      description,
      provider: providerRaw,
      enabled,
      sortOrder,
    })
  } catch (e) {
    console.error('[admin] insert model', e)
    return c.json({ error: 'Failed to create model' }, 500)
  }

  const created = await getModelById(client, id)
  if (!created) return c.json({ error: 'Failed to load model' }, 500)
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
  if (typeof body.name === 'string') patch.name = body.name.trim()
  if (typeof body.description === 'string') patch.description = body.description
  if (body.enabled !== undefined) patch.enabled = Boolean(body.enabled)
  if (body.sortOrder !== undefined) {
    const sortN = Number(body.sortOrder)
    if (Number.isFinite(sortN)) patch.sortOrder = Math.floor(sortN)
  }
  if (body.provider !== undefined) {
    if (typeof body.provider !== 'string' || !isBattleLlmProvider(body.provider)) {
      return c.json({ error: 'provider must be minimax or deepseek' }, 400)
    }
    patch.provider = body.provider
  }

  if (Object.keys(patch).length === 0) {
    return c.json({ error: 'No valid fields to update' }, 400)
  }

  if (patch.name !== undefined && !patch.name) {
    return c.json({ error: 'name cannot be empty' }, 400)
  }

  const client = getLibsqlClient()
  const updated = await updateModel(client, id, patch)
  if (!updated) {
    return c.json({ error: 'Model not found or invalid provider' }, 404)
  }
  return c.json({ model: adminModelJson(updated) })
})

adminRouter.delete('/models/:id', async (c) => {
  const id = c.req.param('id')
  if (!id) return c.json({ error: 'id required' }, 400)
  const client = getLibsqlClient()
  const ok = await disableModel(client, id)
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
