import type { Client } from '@libsql/client'
import type { UserRecord } from './usersRepo.ts'

const SESSION_DAYS = 30

export async function createUserSession(client: Client, userId: string): Promise<string> {
  const id = crypto.randomUUID()
  const now = new Date()
  const expires = new Date(now.getTime() + SESSION_DAYS * 24 * 60 * 60 * 1000)
  await client.execute({
    sql: `INSERT INTO user_sessions (id, user_id, expires_at, created_at)
      VALUES (?, ?, ?, ?)`,
    args: [id, userId, expires.toISOString(), now.toISOString()],
  })
  return id
}

export async function deleteUserSession(client: Client, sessionId: string): Promise<void> {
  await client.execute({
    sql: 'DELETE FROM user_sessions WHERE id = ?',
    args: [sessionId],
  })
}

export type SessionUser = Pick<UserRecord, 'id' | 'login' | 'name' | 'avatarUrl' | 'role'>

export async function findUserBySessionId(
  client: Client,
  sessionId: string,
): Promise<SessionUser | null> {
  const now = new Date().toISOString()
  const res = await client.execute({
    sql: `SELECT u.id, u.login, u.name, u.avatar_url, u.role
      FROM user_sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.id = ? AND s.expires_at > ?`,
    args: [sessionId, now],
  })
  if (res.rows.length === 0) return null
  const r = res.rows[0] as Record<string, unknown>
  return {
    id: String(r.id),
    login: String(r.login),
    name: r.name == null ? null : String(r.name),
    avatarUrl: r.avatar_url == null ? null : String(r.avatar_url),
    role: String(r.role ?? ''),
  }
}
