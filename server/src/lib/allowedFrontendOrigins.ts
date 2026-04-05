/** Comma-separated list in ALLOWED_FRONTEND_ORIGINS (full URL or https://host prefix). */
export function parseAllowedFrontendOrigins(): Set<string> {
  const raw = Deno.env.get('ALLOWED_FRONTEND_ORIGINS')?.trim()
  if (!raw) return new Set()
  const out = new Set<string>()
  for (const part of raw.split(',')) {
    const t = part.trim()
    if (!t) continue
    try {
      const base = t.includes('://') ? t : `https://${t}`
      out.add(new URL(base).origin)
    } catch {
      /* ignore invalid segment */
    }
  }
  return out
}

export function normalizeRequestOrigin(originHeader: string | undefined): string | null {
  if (!originHeader?.trim()) return null
  try {
    return new URL(originHeader).origin
  } catch {
    return null
  }
}

/**
 * Validates post-login redirect URL for OAuth `post_login` query / cookie.
 * When allowlist is empty: only API origin (pub) or loopback hosts.
 */
export function validatePostLoginRedirect(
  raw: string,
  allowed: Set<string>,
  apiPub: string,
): string | null {
  const t = raw.trim()
  if (!t || t.length > 800) return null
  let u: URL
  try {
    u = new URL(t)
  } catch {
    return null
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
  if (u.username || u.password) return null

  const origin = u.origin
  if (allowed.size > 0) {
    if (!allowed.has(origin)) return null
  } else {
    let apiOrigin: string
    try {
      apiOrigin = new URL(apiPub).origin
    } catch {
      return null
    }
    if (origin !== apiOrigin) {
      if (!isLoopbackHostname(u.hostname)) return null
    }
  }

  u.hash = ''
  return `${u.origin}${u.pathname}${u.search}`
}

function isLoopbackHostname(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
}
