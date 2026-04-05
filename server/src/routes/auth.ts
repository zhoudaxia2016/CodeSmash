import type { Context } from 'hono'
import { Hono } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { getLibsqlClient } from '../db/client.ts'
import { createUserSession, deleteUserSession, findUserBySessionId } from '../db/userSessionsRepo.ts'
import { upsertUserFromGithub } from '../db/usersRepo.ts'
import { parseAdminGithubIds } from '../lib/adminEnv.ts'
import {
  parseAllowedFrontendOrigins,
  validatePostLoginRedirect,
} from '../lib/allowedFrontendOrigins.ts'
import { codeChallengeS256, randomCodeVerifier } from '../lib/pkce.ts'
import { SESSION_COOKIE } from '../middleware/requireAuth.ts'

const OAUTH_STATE = 'oauth_state'
const OAUTH_VERIFIER = 'oauth_verifier'
/** Set on GET /github; callback has Referer=github.com so we cannot infer browser origin from headers. */
const OAUTH_PUBLIC_ORIGIN = 'oauth_public_origin'
/** Where to send the user after OAuth when frontend is on another origin (GitHub Pages, etc.). */
const OAUTH_POST_LOGIN = 'oauth_post_login'
/** When set, use X-Forwarded-Proto / X-Forwarded-Host to build public URL (place proxy strips untrusted values). */
const TRUST_PROXY = Deno.env.get('TRUST_PROXY') === '1'

function isLoopbackHostname(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
}

/**
 * Browser-visible origin for this request (authorize + callback must match).
 * Same value drives GitHub `redirect_uri` and post-login `302` target.
 *
 * Vite dev proxies :3000 → :8000: we trust `X-Forwarded-Host` only when the
 * direct request hit loopback, and the forwarded host is still loopback (no open redirect).
 */
function publicOrigin(c: Context): string {
  const reqUrl = new URL(c.req.url)
  if (TRUST_PROXY) {
    const xfHost = c.req.header('x-forwarded-host')?.split(',')[0]?.trim()
    const xfProto = c.req.header('x-forwarded-proto')?.split(',')[0]?.trim()
    if (xfHost) {
      const proto = xfProto === 'http' || xfProto === 'https' ? xfProto : reqUrl.protocol.replace(':', '')
      return `${proto}://${xfHost}`
    }
  }
  const xfHostRaw = c.req.header('x-forwarded-host')?.split(',')[0]?.trim()
  if (xfHostRaw && isLoopbackHostname(reqUrl.hostname)) {
    try {
      const fh = new URL(`http://${xfHostRaw}`).hostname
      if (isLoopbackHostname(fh)) {
        const xfProto = c.req.header('x-forwarded-proto')?.split(',')[0]?.trim()
        const proto = xfProto === 'https' || xfProto === 'http' ? xfProto : 'http'
        return `${proto}://${xfHostRaw}`
      }
    } catch {
      /* ignore */
    }
  }
  // changeOrigin proxy: backend often sees :8000 with no forwarded host; use Referer (SPA on :3000).
  const ref = c.req.header('referer')
  if (ref && isLoopbackHostname(reqUrl.hostname) && reqUrl.port === '8000') {
    try {
      const ru = new URL(ref)
      if (isLoopbackHostname(ru.hostname)) return ru.origin
    } catch {
      /* ignore */
    }
  }
  return reqUrl.origin
}

function oauthCallbackUrlForOrigin(pub: string): string {
  return `${pub.replace(/\/$/, '')}/api/auth/github/callback`
}

function redirectWithAuthError(base: string, msg: string): string {
  let u: URL
  try {
    u = new URL(base)
  } catch {
    u = new URL('/', 'https://invalid.invalid')
  }
  u.searchParams.set('auth_error', msg)
  return u.toString()
}

function parseStoredPublicOrigin(raw: string | undefined | null): string | null {
  if (raw == null) return null
  const t = raw.trim()
  if (!t || t.length > 200) return null
  let u: URL
  try {
    u = new URL(t)
  } catch {
    return null
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
  if (u.username || u.password) return null
  return u.origin
}

const cookieSecure = Deno.env.get('COOKIE_SECURE') === '1'
/** Cross-site SPA (different origin from API): session must be SameSite=None; Secure. */
const cookieSameSiteNone = Deno.env.get('COOKIE_SAMESITE_NONE') === '1'

/** Path / SameSite / Secure / HttpOnly must match on Set-Cookie and Delete-Cookie or the browser keeps the session. */
function cookieBaseOpts() {
  if (cookieSameSiteNone) {
    return {
      path: '/' as const,
      sameSite: 'None' as const,
      secure: true,
      httpOnly: true,
    }
  }
  return {
    path: '/' as const,
    sameSite: 'Lax' as const,
    secure: cookieSecure,
    httpOnly: true,
  }
}

function oauthCookieOpts(maxAge: number) {
  return {
    ...cookieBaseOpts(),
    maxAge,
  }
}

function oauthCookieDeleteOpts() {
  return cookieBaseOpts()
}

function sessionCookieOpts() {
  return {
    ...cookieBaseOpts(),
    maxAge: 60 * 60 * 24 * 30,
  }
}

export const authRouter = new Hono()

authRouter.get('/github', async (c) => {
  const clientId = Deno.env.get('GITHUB_CLIENT_ID')?.trim()
  if (!clientId) {
    return c.json({ error: 'GitHub OAuth is not configured' }, 503)
  }

  const pub = publicOrigin(c)
  const redir = oauthCallbackUrlForOrigin(pub)
  const state = crypto.randomUUID()
  const verifier = randomCodeVerifier()
  const challenge = await codeChallengeS256(verifier)
  setCookie(c, OAUTH_STATE, state, oauthCookieOpts(600))
  setCookie(c, OAUTH_VERIFIER, verifier, oauthCookieOpts(600))
  setCookie(c, OAUTH_PUBLIC_ORIGIN, pub, oauthCookieOpts(600))

  const allowed = parseAllowedFrontendOrigins()
  const postLoginParam = c.req.query('post_login')?.trim()
  if (postLoginParam) {
    const target = validatePostLoginRedirect(postLoginParam, allowed, pub)
    if (!target) {
      return c.json({ error: 'invalid post_login' }, 400)
    }
    setCookie(c, OAUTH_POST_LOGIN, target, oauthCookieOpts(600))
  } else {
    deleteCookie(c, OAUTH_POST_LOGIN, oauthCookieDeleteOpts())
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redir,
    scope: 'read:user',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  })
  const url = `https://github.com/login/oauth/authorize?${params.toString()}`
  return c.redirect(url, 302)
})

authRouter.get('/github/callback', async (c) => {
  const storedPub = getCookie(c, OAUTH_PUBLIC_ORIGIN)
  const postLoginStored = getCookie(c, OAUTH_POST_LOGIN)
  const pub = parseStoredPublicOrigin(storedPub)
  const allowed = parseAllowedFrontendOrigins()
  const postLoginTarget =
    pub && postLoginStored
      ? validatePostLoginRedirect(postLoginStored, allowed, pub)
      : null

  deleteCookie(c, OAUTH_PUBLIC_ORIGIN, oauthCookieDeleteOpts())
  deleteCookie(c, OAUTH_POST_LOGIN, oauthCookieDeleteOpts())

  const fallbackBase = publicOrigin(c)
  const fail = async (msg: string) => {
    const base =
      postLoginTarget ??
      (pub ? `${pub.replace(/\/$/, '')}/` : `${fallbackBase.replace(/\/$/, '')}/`)
    return c.redirect(redirectWithAuthError(base, msg), 302)
  }

  const code = c.req.query('code')
  const state = c.req.query('state')
  const storedState = getCookie(c, OAUTH_STATE)
  const verifier = getCookie(c, OAUTH_VERIFIER)
  deleteCookie(c, OAUTH_STATE, oauthCookieDeleteOpts())
  deleteCookie(c, OAUTH_VERIFIER, oauthCookieDeleteOpts())

  if (!pub) {
    return c.redirect(
      redirectWithAuthError(`${fallbackBase.replace(/\/$/, '')}/`, 'missing_oauth_context'),
      302,
    )
  }

  if (!code || !state || !storedState || state !== storedState || !verifier) {
    return await fail('invalid_state')
  }

  const clientId = Deno.env.get('GITHUB_CLIENT_ID')?.trim()
  const clientSecret = Deno.env.get('GITHUB_CLIENT_SECRET')?.trim()
  const redir = oauthCallbackUrlForOrigin(pub)
  if (!clientId || !clientSecret) {
    return await fail('oauth_not_configured')
  }

  const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redir,
      code_verifier: verifier,
    }),
  })

  const tokenJson = (await tokenRes.json()) as {
    access_token?: string
    error?: string
    error_description?: string
  }
  if (!tokenRes.ok || !tokenJson.access_token) {
    console.error('[auth] token exchange failed', tokenJson)
    return await fail('token_exchange_failed')
  }

  const userRes = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${tokenJson.access_token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'CodeSmash-Arena',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  })
  if (!userRes.ok) {
    console.error('[auth] github user failed', await userRes.text())
    return await fail('github_user_failed')
  }
  const gh = (await userRes.json()) as {
    id: number
    login: string
    name: string | null
    avatar_url: string | null
  }
  const githubId = String(gh.id)

  const client = getLibsqlClient()
  const user = await upsertUserFromGithub(client, {
    githubId,
    login: gh.login,
    name: gh.name ?? null,
    avatarUrl: gh.avatar_url ?? null,
    adminGithubIds: parseAdminGithubIds(),
  })

  const sessionId = await createUserSession(client, user.id)
  setCookie(c, SESSION_COOKIE, sessionId, sessionCookieOpts())
  const home = postLoginTarget ?? `${pub.replace(/\/$/, '')}/`
  return c.redirect(home, 302)
})

authRouter.get('/me', async (c) => {
  const sid = getCookie(c, SESSION_COOKIE)
  if (!sid) {
    return c.json({ user: null })
  }
  const client = getLibsqlClient()
  const user = await findUserBySessionId(client, sid)
  if (!user) {
    deleteCookie(c, SESSION_COOKIE, cookieBaseOpts())
    return c.json({ user: null })
  }
  return c.json({
    user: {
      id: user.id,
      login: user.login,
      name: user.name,
      avatarUrl: user.avatarUrl,
      role: user.role,
    },
  })
})

authRouter.post('/logout', async (c) => {
  const sid = getCookie(c, SESSION_COOKIE)
  if (sid) {
    const client = getLibsqlClient()
    await deleteUserSession(client, sid)
  }
  deleteCookie(c, SESSION_COOKIE, cookieBaseOpts())
  return c.json({ ok: true })
})
