import type { Client } from '@libsql/client'

export type BattleResultListRow = {
  id: string
  problemId: string
  modelAId: string
  modelBId: string
  createdAt: string
  status: string | null
  completedAt: string | null
  creator: {
    id: string
    login: string
    name: string | null
    avatarUrl: string | null
  }
}

export async function listBattleResultsForUser(
  client: Client,
  userId: string,
  limit: number,
  offset: number,
): Promise<BattleResultListRow[]> {
  const res = await client.execute({
    sql: `SELECT
        br.id,
        br.problem_id,
        br.model_a_id,
        br.model_b_id,
        br.created_at,
        json_extract(br.payload_json, '$.status') AS battle_status,
        json_extract(br.payload_json, '$.completedAt') AS battle_completed_at,
        u.id AS creator_id,
        u.login AS creator_login,
        u.name AS creator_name,
        u.avatar_url AS creator_avatar_url
      FROM battle_results br
      JOIN users u ON u.id = br.created_by
      WHERE br.created_by = ?
      ORDER BY br.created_at DESC
      LIMIT ? OFFSET ?`,
    args: [userId, limit, offset],
  })
  return res.rows.map((row) => {
    const r = row as Record<string, unknown>
    return {
      id: String(r.id),
      problemId: String(r.problem_id),
      modelAId: String(r.model_a_id),
      modelBId: String(r.model_b_id),
      createdAt: String(r.created_at),
      status: r.battle_status == null ? null : String(r.battle_status),
      completedAt: r.battle_completed_at == null ? null : String(r.battle_completed_at),
      creator: {
        id: String(r.creator_id),
        login: String(r.creator_login),
        name: r.creator_name == null ? null : String(r.creator_name),
        avatarUrl: r.creator_avatar_url == null ? null : String(r.creator_avatar_url),
      },
    }
  })
}

export async function listAllBattleResults(
  client: Client,
  limit: number,
  offset: number,
): Promise<BattleResultListRow[]> {
  const res = await client.execute({
    sql: `SELECT
        br.id,
        br.problem_id,
        br.model_a_id,
        br.model_b_id,
        br.created_at,
        json_extract(br.payload_json, '$.status') AS battle_status,
        json_extract(br.payload_json, '$.completedAt') AS battle_completed_at,
        u.id AS creator_id,
        u.login AS creator_login,
        u.name AS creator_name,
        u.avatar_url AS creator_avatar_url
      FROM battle_results br
      JOIN users u ON u.id = br.created_by
      ORDER BY br.created_at DESC
      LIMIT ? OFFSET ?`,
    args: [limit, offset],
  })
  return res.rows.map((row) => {
    const r = row as Record<string, unknown>
    return {
      id: String(r.id),
      problemId: String(r.problem_id),
      modelAId: String(r.model_a_id),
      modelBId: String(r.model_b_id),
      createdAt: String(r.created_at),
      status: r.battle_status == null ? null : String(r.battle_status),
      completedAt: r.battle_completed_at == null ? null : String(r.battle_completed_at),
      creator: {
        id: String(r.creator_id),
        login: String(r.creator_login),
        name: r.creator_name == null ? null : String(r.creator_name),
        avatarUrl: r.creator_avatar_url == null ? null : String(r.creator_avatar_url),
      },
    }
  })
}

export async function getBattleResultPayloadRowForUser(
  client: Client,
  battleId: string,
  userId: string,
): Promise<{ payloadJson: string } | null> {
  const res = await client.execute({
    sql: `SELECT payload_json FROM battle_results WHERE id = ? AND created_by = ?`,
    args: [battleId, userId],
  })
  if (res.rows.length === 0) return null
  const r = res.rows[0] as Record<string, unknown>
  return { payloadJson: String(r.payload_json) }
}

export async function getBattleResultPayloadRow(
  client: Client,
  battleId: string,
): Promise<{ payloadJson: string } | null> {
  const res = await client.execute({
    sql: `SELECT payload_json FROM battle_results WHERE id = ?`,
    args: [battleId],
  })
  if (res.rows.length === 0) return null
  const r = res.rows[0] as Record<string, unknown>
  return { payloadJson: String(r.payload_json) }
}

export async function deleteBattleResultForUser(
  client: Client,
  battleId: string,
  userId: string,
): Promise<boolean> {
  const res = await client.execute({
    sql: `DELETE FROM battle_results WHERE id = ? AND created_by = ?`,
    args: [battleId, userId],
  })
  return (res.rowsAffected ?? 0) > 0
}

export async function listBattlePayloadsForLeaderboard(
  client: Client,
  filter: { userId?: string; problemId?: string },
): Promise<Array<{ problemId: string; payloadJson: string }>> {
  const cond: string[] = []
  const args: string[] = []
  if (filter.userId) {
    cond.push('created_by = ?')
    args.push(filter.userId)
  }
  if (filter.problemId) {
    cond.push('problem_id = ?')
    args.push(filter.problemId)
  }
  const where = cond.length > 0 ? `WHERE ${cond.join(' AND ')}` : ''
  const res = await client.execute({
    sql: `SELECT problem_id, payload_json FROM battle_results ${where}`,
    args,
  })
  return res.rows.map((row) => {
    const r = row as Record<string, unknown>
    return {
      problemId: String(r.problem_id),
      payloadJson: String(r.payload_json),
    }
  })
}

export async function upsertBattleResult(
  client: Client,
  input: {
    id: string
    problemId: string
    modelAId: string
    modelBId: string
    payloadJson: string
    createdBy: string
  },
): Promise<void> {
  const now = new Date().toISOString()
  await client.execute({
    sql: `INSERT INTO battle_results (
      id, problem_id, model_a_id, model_b_id, payload_json, created_by, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      problem_id = excluded.problem_id,
      model_a_id = excluded.model_a_id,
      model_b_id = excluded.model_b_id,
      payload_json = excluded.payload_json,
      created_by = excluded.created_by,
      created_at = excluded.created_at`,
    args: [
      input.id,
      input.problemId,
      input.modelAId,
      input.modelBId,
      input.payloadJson,
      input.createdBy,
      now,
    ],
  })
}
