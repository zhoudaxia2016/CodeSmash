import type { Context, Next } from 'hono'
import { getCookie } from 'hono/cookie'
import { getLibsqlClient } from '../db/client.ts'
import { findUserBySessionId } from '../db/userSessionsRepo.ts'
import { SESSION_COOKIE } from './requireAuth.ts'

export async function requireAdmin(c: Context, next: Next) {
  const sid = getCookie(c, SESSION_COOKIE)
  if (!sid) {
    return c.json({ error: 'Unauthorized', message: '请先登录' }, 401)
  }
  const client = getLibsqlClient()
  const user = await findUserBySessionId(client, sid)
  if (!user) {
    return c.json({ error: 'Unauthorized', message: '会话已过期，请重新登录' }, 401)
  }
  if (user.role !== 'admin') {
    return c.json({ error: 'Forbidden', message: '需要管理员权限' }, 403)
  }
  c.set('user', user)
  await next()
}
