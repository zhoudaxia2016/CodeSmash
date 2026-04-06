import { Hono } from 'hono'
import { getLibsqlClient } from '../db/client.ts'
import { getModelById, listModels } from '../db/modelsRepo.ts'

const modelsRouter = new Hono()

function toApiModel(m: Awaited<ReturnType<typeof listModels>>[number]) {
  return {
    id: m.id,
    name: m.name,
    provider: m.provider,
    enabled: m.enabled,
  }
}

modelsRouter.get('/', async (c) => {
  const client = getLibsqlClient()
  const enabled = c.req.query('enabled')
  const rows = await listModels(client, { enabledOnly: enabled === 'true' })
  return c.json({ models: rows.map(toApiModel) })
})

modelsRouter.get('/:id', async (c) => {
  const id = c.req.param('id')
  const client = getLibsqlClient()
  const model = await getModelById(client, id)
  if (!model) {
    return c.json({ error: 'Model not found' }, 404)
  }
  return c.json({ model: toApiModel(model) })
})

export { modelsRouter }
