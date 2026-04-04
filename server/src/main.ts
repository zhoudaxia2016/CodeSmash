import { Hono } from 'hono'
import { initDb } from './db/schema.ts'
import { rateLimit } from './middleware/rateLimit.ts'
import { battlesRouter } from './routes/battles.ts'
import { problemsRouter } from './routes/problems.ts'
import { modelsRouter } from './routes/models.ts'

await initDb()

const app = new Hono()

app.use('*', rateLimit)

app.get('/', (c) => c.json({ status: 'ok', service: 'codesmesh-api' }))

const api = new Hono()

api.route('/battles', battlesRouter)
api.route('/problems', problemsRouter)
api.route('/models', modelsRouter)

api.get('/leaderboard', (c) => {
  return c.json({ leaderboard: [] })
})

app.route('/api', api)

const PORT = 8000
console.log(`Server running on http://localhost:${PORT}`)
Deno.serve({ port: PORT }, app.fetch)