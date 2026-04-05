import type { Context, Next } from 'hono'
import {
  normalizeRequestOrigin,
  parseAllowedFrontendOrigins,
} from '../lib/allowedFrontendOrigins.ts'

const MUTATING = new Set(['POST', 'PATCH', 'PUT', 'DELETE'])

function isLoopbackOrigin(origin: string): boolean {
  try {
    const u = new URL(origin)
    const h = u.hostname
    return (
      h === 'localhost' ||
      h === '127.0.0.1' ||
      h === '[::1]' ||
      h === '::1'
    )
  } catch {
    return false
  }
}

function refererOrigin(referer: string | undefined): string | null {
  if (!referer?.trim()) return null
  try {
    return new URL(referer).origin
  } catch {
    return null
  }
}

function isApplicationJsonContentType(c: Context): boolean {
  const raw = c.req.header('Content-Type') ?? ''
  const media = raw.split(';')[0]?.trim().toLowerCase() ?? ''
  return media === 'application/json'
}

/**
 * CSRF-oriented checks for state-changing methods:
 * 1) Origin or Referer must match ALLOWED_FRONTEND_ORIGINS (or dev / same-host fallbacks).
 * 2) POST/PATCH/PUT must use Content-Type: application/json (blocks classic form POST).
 */
export async function safeMutatingRequests(c: Context, next: Next) {
  if (!MUTATING.has(c.req.method)) {
    await next()
    return
  }

  const allowed = parseAllowedFrontendOrigins()
  const origin = normalizeRequestOrigin(c.req.header('Origin') ?? undefined)
  const refO = refererOrigin(c.req.header('Referer') ?? undefined)
  const hostOrigin = new URL(c.req.url).origin

  const originTrusted = (() => {
    if (allowed.size > 0) {
      if (origin && allowed.has(origin)) return true
      if (refO && allowed.has(refO)) return true
      if (origin === hostOrigin) return true
      if (refO === hostOrigin) return true
      return false
    }
    if (!origin && !refO) return true
    if (origin && (origin === hostOrigin || isLoopbackOrigin(origin))) return true
    if (refO && (refO === hostOrigin || isLoopbackOrigin(refO))) return true
    return false
  })()

  if (!originTrusted) {
    return c.json(
      { error: 'forbidden', message: 'Invalid or missing Origin' },
      403,
    )
  }

  const method = c.req.method
  if (method === 'POST' || method === 'PATCH' || method === 'PUT') {
    if (!isApplicationJsonContentType(c)) {
      return c.json(
        {
          error: 'unsupported_media_type',
          message: 'Content-Type must be application/json',
        },
        415,
      )
    }
  }

  await next()
}
