import { Hono } from 'hono'

const modelsRouter = new Hono()

type Model = {
  id: string
  name: string
  description: string
  provider: string
  enabled: boolean
}

const platformModels: Model[] = [
  {
    id: 'minimax-2.7',
    name: 'MiniMax 2.7',
    description: 'MiniMax 最新编程模型，代码能力强',
    provider: 'minimax',
    enabled: true,
  },
  {
    id: 'deepseek-v3',
    name: 'DeepSeek V3',
    description: 'DeepSeek 最新模型',
    provider: 'deepseek',
    enabled: true,
  },
]

modelsRouter.get('/', (c) => {
  const enabled = c.req.query('enabled')
  let models = platformModels
  if (enabled === 'true') {
    models = models.filter((m) => m.enabled)
  }
  return c.json({ models })
})

modelsRouter.get('/:id', (c) => {
  const id = c.req.param('id')
  const model = platformModels.find((m) => m.id === id)
  if (!model) {
    return c.json({ error: 'Model not found' }, 404)
  }
  return c.json({ model })
})

export { modelsRouter }