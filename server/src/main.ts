import { Hono } from 'hono'
import { initDb } from './db/schema.ts'
import { corsAllowedFrontends } from './middleware/cors.ts'
import { rateLimit } from './middleware/rateLimit.ts'
import { safeMutatingRequests } from './middleware/safeMutating.ts'
import { adminRouter } from './routes/admin.ts'
import { authRouter } from './routes/auth.ts'
import { battleResultsRouter } from './routes/battleResults.ts'
import { battlesRouter } from './routes/battles.ts'
import { problemsRouter } from './routes/problems.ts'
import { leaderboardRouter } from './routes/leaderboard.ts'
import { modelsRouter } from './routes/models.ts'
import { parseAdminGithubIds } from './lib/adminEnv.ts'

await initDb()

const adminIdCount = parseAdminGithubIds().size
if (adminIdCount > 0) {
  console.log(`[config] ADMIN_GITHUB_IDS: ${adminIdCount} id(s) loaded`)
} else {
  console.log('[config] ADMIN_GITHUB_IDS: (empty — no env or not loaded; use deno task dev / --env-file=.env)')
}

const app = new Hono()

app.use('*', rateLimit)

app.get('/', (c) => c.json({ status: 'ok', service: 'codesmash-api' }))

const api = new Hono()

api.use('*', corsAllowedFrontends)
api.use('*', safeMutatingRequests)

api.route('/auth', authRouter)
api.route('/admin', adminRouter)
api.route('/battle-results', battleResultsRouter)
api.route('/battles', battlesRouter)
api.route('/problems', problemsRouter)
api.route('/models', modelsRouter)
api.route('/leaderboard', leaderboardRouter)

app.route('/api', api)

const PORT = 8000
console.log(`Server running on http://localhost:${PORT}`)
Deno.serve({ port: PORT }, app.fetch)