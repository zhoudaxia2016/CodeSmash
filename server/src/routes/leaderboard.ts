import { Hono } from 'hono'
import { getCookie } from 'hono/cookie'
import { getLibsqlClient } from '../db/client.ts'
import { listBattlePayloadsForLeaderboard } from '../db/battleResultsRepo.ts'
import { aggregateLeaderboardFromPayloads } from '../lib/leaderboardAggregate.ts'
import { listModels } from '../db/modelsRepo.ts'
import { findUserBySessionId } from '../db/userSessionsRepo.ts'
import { SESSION_COOKIE } from '../middleware/requireAuth.ts'

const leaderboardRouter = new Hono()

leaderboardRouter.get('/', async (c) => {
  const problemIdRaw = c.req.query('problemId')
  const problemId = problemIdRaw && problemIdRaw.length > 0 ? problemIdRaw : undefined
  const scope = c.req.query('scope') === 'mine' ? 'mine' : 'all'

  let userId: string | undefined
  if (scope === 'mine') {
    const sid = getCookie(c, SESSION_COOKIE)
    if (!sid) {
      return c.json({ error: 'Unauthorized', message: '请先登录' }, 401)
    }
    const client = getLibsqlClient()
    const user = await findUserBySessionId(client, sid)
    if (!user) {
      return c.json({ error: 'Unauthorized', message: '会话已过期，请重新登录' }, 401)
    }
    userId = user.id
  }

  const client = getLibsqlClient()
  const battleRows = await listBattlePayloadsForLeaderboard(client, { userId, problemId })
  const agg = aggregateLeaderboardFromPayloads(battleRows)
  const models = await listModels(client, { enabledOnly: true })
  const global = !problemId

  type Entry = {
    modelId: string
    modelName: string
    problemId?: string
    global: boolean
    passRate: number
    avgTimeMs: number
    battleCount: number
    selfTestQuality: number
  }

  const entries: Entry[] = models.map((m) => {
    const a = agg.get(m.id)
    const passRate = a && a.totalSum > 0 ? a.passedSum / a.totalSum : 0
    const battleCount = a?.battles ?? 0
    const avgTimeMs = a && a.timeN > 0 ? a.timeSum / a.timeN : 0
    const selfTestQuality = a && a.selfN > 0 ? a.selfSum / a.selfN : 0
    return {
      modelId: m.id,
      modelName: m.name,
      problemId: global ? undefined : problemId,
      global,
      passRate,
      avgTimeMs: Math.round(avgTimeMs),
      battleCount,
      selfTestQuality,
    }
  })

  const known = new Set(models.map((m) => m.id))
  for (const [id, a] of agg) {
    if (known.has(id)) continue
    const passRate = a.totalSum > 0 ? a.passedSum / a.totalSum : 0
    entries.push({
      modelId: id,
      modelName: '未知模型',
      problemId: global ? undefined : problemId,
      global,
      passRate,
      avgTimeMs: Math.round(a.timeN > 0 ? a.timeSum / a.timeN : 0),
      battleCount: a.battles,
      selfTestQuality: a.selfN > 0 ? a.selfSum / a.selfN : 0,
    })
  }

  entries.sort((x, y) => {
    if (y.passRate !== x.passRate) return y.passRate - x.passRate
    if (x.avgTimeMs !== y.avgTimeMs) return x.avgTimeMs - y.avgTimeMs
    return y.battleCount - x.battleCount
  })

  return c.json({ entries })
})

export { leaderboardRouter }
