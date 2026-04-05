import { Hono } from 'hono'
import { getLibsqlClient } from '../db/client.ts'
import type { SessionUser } from '../db/userSessionsRepo.ts'
import { upsertBattleResult } from '../db/battleResultsRepo.ts'
import { getSessionUser, requireAuth } from '../middleware/requireAuth.ts'

const battleResultsRouter = new Hono<{ Variables: { user?: SessionUser } }>()

battleResultsRouter.post('/', requireAuth, async (c) => {
  const user = getSessionUser(c)
  const body = await c.req.json() as { battle?: Record<string, unknown> }
  const b = body.battle
  if (!b || typeof b !== 'object') {
    return c.json({ error: 'battle object required' }, 400)
  }
  const id = typeof b.id === 'string' ? b.id : ''
  const problemId = typeof b.problemId === 'string' ? b.problemId : ''
  const modelAId = typeof b.modelAId === 'string' ? b.modelAId : ''
  const modelBId = typeof b.modelBId === 'string' ? b.modelBId : ''
  if (!id || !problemId || !modelAId || !modelBId) {
    return c.json({
      error: 'battle must include id, problemId, modelAId, modelBId',
    }, 400)
  }

  let payloadJson: string
  try {
    payloadJson = JSON.stringify(b)
  } catch {
    return c.json({ error: 'invalid battle payload' }, 400)
  }

  const client = getLibsqlClient()
  try {
    await upsertBattleResult(client, {
      id,
      problemId,
      modelAId,
      modelBId,
      payloadJson,
      createdBy: user.id,
    })
  } catch (e) {
    console.error('[battle-results] upsert', e)
    return c.json({ error: 'Failed to save battle result' }, 500)
  }
  return c.json({ ok: true, id }, 201)
})

export { battleResultsRouter }
