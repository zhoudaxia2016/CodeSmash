import type { Client } from '@libsql/client'

export type UserRecord = {
  id: string
  githubId: string
  login: string
  name: string | null
  avatarUrl: string | null
  role: string
  createdAt: string
  updatedAt: string
}

function rowToUser(r: Record<string, unknown>): UserRecord {
  return {
    id: String(r.id),
    githubId: String(r.github_id),
    login: String(r.login),
    name: r.name == null ? null : String(r.name),
    avatarUrl: r.avatar_url == null ? null : String(r.avatar_url),
    role: String(r.role ?? ''),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  }
}

export async function getUserById(client: Client, id: string): Promise<UserRecord | null> {
  const res = await client.execute({
    sql: 'SELECT * FROM users WHERE id = ?',
    args: [id],
  })
  if (res.rows.length === 0) return null
  return rowToUser(res.rows[0] as Record<string, unknown>)
}

export async function upsertUserFromGithub(
  client: Client,
  input: {
    githubId: string
    login: string
    name: string | null
    avatarUrl: string | null
    adminGithubIds: Set<string>
  },
): Promise<UserRecord> {
  const now = new Date().toISOString()
  const role = input.adminGithubIds.has(input.githubId) ? 'admin' : ''

  const existing = await client.execute({
    sql: 'SELECT * FROM users WHERE github_id = ?',
    args: [input.githubId],
  })

  if (existing.rows.length > 0) {
    const cur = rowToUser(existing.rows[0] as Record<string, unknown>)
    let nextRole = cur.role
    if (input.adminGithubIds.has(input.githubId)) nextRole = 'admin'
    else if (cur.role === 'admin') nextRole = ''
    await client.execute({
      sql: `UPDATE users SET
        login = ?, name = ?, avatar_url = ?, role = ?, updated_at = ?
      WHERE github_id = ?`,
      args: [
        input.login,
        input.name,
        input.avatarUrl,
        nextRole,
        now,
        input.githubId,
      ],
    })
    const again = await client.execute({
      sql: 'SELECT * FROM users WHERE github_id = ?',
      args: [input.githubId],
    })
    return rowToUser(again.rows[0] as Record<string, unknown>)
  }

  const id = crypto.randomUUID()
  await client.execute({
    sql: `INSERT INTO users (
      id, github_id, login, name, avatar_url, role, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      input.githubId,
      input.login,
      input.name,
      input.avatarUrl,
      role || '',
      now,
      now,
    ],
  })
  const row = await client.execute({
    sql: 'SELECT * FROM users WHERE id = ?',
    args: [id],
  })
  return rowToUser(row.rows[0] as Record<string, unknown>)
}
