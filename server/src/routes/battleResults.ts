import { Hono } from 'hono'
import { getLibsqlClient } from '../db/client.ts'
import type { SessionUser } from '../db/userSessionsRepo.ts'
import {
  deleteBattleResultForUser,
  getBattleResultPayloadRow,
  listAllBattleResults,
  upsertBattleResult,
} from '../db/battleResultsRepo.ts'
import { evictActiveBattle } from './battles.ts'
import { getSessionUser, requireAuth } from '../middleware/requireAuth.ts'

const battleResultsRouter = new Hono<{ Variables: { user?: SessionUser } }>()

const LIST_LIMIT_MAX = 200

battleResultsRouter.get('/', async (c) => {
  const limitRaw = c.req.query('limit')
  const offsetRaw = c.req.query('offset')
  let limit = Number(limitRaw ?? 50)
  let offset = Number(offsetRaw ?? 0)
  if (!Number.isFinite(limit) || limit < 1) limit = 50
  if (limit > LIST_LIMIT_MAX) limit = LIST_LIMIT_MAX
  if (!Number.isFinite(offset) || offset < 0) offset = 0

  const client = getLibsqlClient()
  try {
    const items = await listAllBattleResults(client, limit, offset)
    return c.json({ items })
  } catch (e) {
    console.error('[battle-results] list', e)
    return c.json({ error: 'Failed to list battle results' }, 500)
  }
})

battleResultsRouter.get('/:id', async (c) => {
  const id = c.req.param('id')
  if (!id) return c.json({ error: 'id required' }, 400)

  const client = getLibsqlClient()
  let row: { payloadJson: string } | null
  try {
    row = await getBattleResultPayloadRow(client, id)
  } catch (e) {
    console.error('[battle-results] get', e)
    return c.json({ error: 'Failed to load battle result' }, 500)
  }
  if (!row) return c.json({ error: 'Not found' }, 404)

  let battle: unknown
  try {
    battle = JSON.parse(row.payloadJson) as unknown
  } catch {
    return c.json({ error: 'Corrupt battle payload' }, 500)
  }
  return c.json({ battle })
})

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

battleResultsRouter.delete('/:id', requireAuth, async (c) => {
  const user = getSessionUser(c)
  const id = c.req.param('id')
  if (!id) return c.json({ error: 'id required' }, 400)

  const client = getLibsqlClient()
  try {
    const ok = await deleteBattleResultForUser(client, id, user.id)
    if (!ok) return c.json({ error: 'Not found' }, 404)
    evictActiveBattle(id)
    return c.json({ ok: true })
  } catch (e) {
    console.error('[battle-results] delete', e)
    return c.json({ error: 'Failed to delete battle result' }, 500)
  }
})

export { battleResultsRouter }
