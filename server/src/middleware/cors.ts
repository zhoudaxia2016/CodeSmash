import type { Context, Next } from 'hono'
import {
  normalizeRequestOrigin,
  parseAllowedFrontendOrigins,
} from '../lib/allowedFrontendOrigins.ts'

/**
 * Reflect Origin when it is listed in ALLOWED_FRONTEND_ORIGINS (required for
 * credentialed fetch from a separate frontend host, e.g. GitHub Pages → API).
 */
export async function corsAllowedFrontends(c: Context, next: Next) {
  const allowed = parseAllowedFrontendOrigins()
  if (allowed.size === 0) {
    await next()
    return
  }

  const origin = normalizeRequestOrigin(c.req.header('Origin') ?? undefined)
  if (origin && allowed.has(origin)) {
    c.header('Access-Control-Allow-Origin', origin)
    c.header('Access-Control-Allow-Credentials', 'true')
    c.header('Vary', 'Origin')
  }

  if (c.req.method === 'OPTIONS') {
    c.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
    c.header('Access-Control-Allow-Headers', 'Content-Type')
    return c.body(null, 204)
  }

  await next()
}
