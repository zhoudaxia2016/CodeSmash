import type { Client } from '@libsql/client'

export const BATTLE_DAILY_QUOTA_ANON = 10
export const BATTLE_DAILY_QUOTA_USER = 50

/** UTC calendar day `YYYY-MM-DD` for daily reset at UTC midnight. */
export function battleQuotaUtcDay(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Atomically increments today's count if below `limit`.
 * @returns whether consumption succeeded (caller should reject the battle if false).
 */
export async function tryConsumeBattleDailyQuota(
  client: Client,
  subject: string,
  day: string,
  limit: number,
): Promise<boolean> {
  const res = await client.execute({
    sql: `INSERT INTO battle_daily_quota (subject, day, count) VALUES (?, ?, 1)
          ON CONFLICT(subject, day) DO UPDATE SET count = count + 1
          WHERE battle_daily_quota.count < ?
          RETURNING count`,
    args: [subject, day, limit],
  })
  if (res.rows.length > 0) return true
  return false
}
