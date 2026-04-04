import { Hono } from 'hono'

const leaderboardRouter = new Hono()

const leaderboardEntries = [
  {
    modelId: 'gpt-4o',
    modelName: 'GPT-4o',
    problemId: undefined,
    global: true,
    passRate: 0.87,
    avgTimeMs: 42,
    battleCount: 156,
    selfTestQuality: 0.82,
  },
  {
    modelId: 'claude-sonnet-4',
    modelName: 'Claude Sonnet 4',
    problemId: undefined,
    global: true,
    passRate: 0.91,
    avgTimeMs: 38,
    battleCount: 142,
    selfTestQuality: 0.88,
  },
  {
    modelId: 'gemini-2.0-flash',
    modelName: 'Gemini 2.0 Flash',
    problemId: undefined,
    global: true,
    passRate: 0.85,
    avgTimeMs: 28,
    battleCount: 98,
    selfTestQuality: 0.75,
  },
]

leaderboardRouter.get('/', (c) => {
  const problemId = c.req.query('problemId')

  let entries = leaderboardEntries
  if (problemId) {
    entries = entries.map((e) => ({ ...e, problemId, global: false }))
  }

  const sorted = [...entries].sort((a, b) => b.passRate - a.passRate)

  return c.json({ entries: sorted })
})

export { leaderboardRouter }
