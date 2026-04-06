import type { Context, Next } from 'hono'
import { getCookie } from 'hono/cookie'
import { getLibsqlClient } from '../db/client.ts'
import { findUserBySessionId, type SessionUser } from '../db/userSessionsRepo.ts'

export const SESSION_COOKIE = 'cm_session'

/** Valid session cookie → user; missing or expired → null (no 401). */
export async function findSessionUserFromRequest(c: Context): Promise<SessionUser | null> {
  const sid = getCookie(c, SESSION_COOKIE)
  if (!sid) return null
  const client = getLibsqlClient()
  return await findUserBySessionId(client, sid)
}

export async function requireAuth(c: Context, next: Next) {
  const sid = getCookie(c, SESSION_COOKIE)
  if (!sid) {
    return c.json({ error: 'Unauthorized', message: '请先登录' }, 401)
  }
  const client = getLibsqlClient()
  const user = await findUserBySessionId(client, sid)
  if (!user) {
    return c.json({ error: 'Unauthorized', message: '会话已过期，请重新登录' }, 401)
  }
  c.set('user', user)
  await next()
}

export function getSessionUser(c: Context): SessionUser {
  const u = c.get('user')
  if (!u) throw new Error('getSessionUser: missing user (use after requireAuth)')
  return u
}
