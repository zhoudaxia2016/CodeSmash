import type { MiddlewareHandler } from 'hono'

const RATE_LIMIT_WINDOW_MS = 60 * 1000
const RATE_LIMIT_MAX = 60

const requestCounts = new Map<string, { count: number; resetAt: number }>()

export const rateLimit: MiddlewareHandler = async (c, next) => {
  const pathname = new URL(c.req.url).pathname
  /** Battle GET is polled ~every 650ms during a run; global 60/min would 429 and freeze the UI on stale snapshots. */
  if (c.req.method === 'GET' && /^\/api\/battles\/[^/]+/.test(pathname)) {
    await next()
    return
  }

  const ip = c.req.header('x-forwarded-for') || c.req.header('cf-connecting-ip') || 'unknown'
  const now = Date.now()

  let record = requestCounts.get(ip)
  if (!record || now > record.resetAt) {
    record = { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS }
    requestCounts.set(ip, record)
  }

  record.count++

  const remaining = Math.max(0, RATE_LIMIT_MAX - record.count)
  const limit = RATE_LIMIT_MAX
  const resetAt = record.resetAt

  c.set('rateLimit', { remaining, limit, resetAt })

  c.header('X-RateLimit-Limit', String(limit))
  c.header('X-RateLimit-Remaining', String(remaining))
  c.header('X-RateLimit-Reset', String(Math.floor(resetAt / 1000)))

  if (record.count > RATE_LIMIT_MAX) {
    return c.json(
      { error: '请求过于频繁，请稍后重试', code: 'RATE_LIMIT_EXCEEDED' },
      429
    )
  }

  await next()
}
