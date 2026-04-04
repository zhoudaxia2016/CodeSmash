import { createClient, type Client } from '@libsql/client'

let cached: Client | null | undefined

/** Returns null if `LIBSQL_URL` is unset. */
export function getLibsqlClient(): Client | null {
  if (cached !== undefined) return cached
  const url = Deno.env.get('LIBSQL_URL')?.trim()
  if (!url) {
    cached = null
    return null
  }
  const authToken = Deno.env.get('LIBSQL_AUTH_TOKEN')?.trim()
  cached = createClient({
    url,
    ...(authToken ? { authToken } : {}),
  })
  return cached
}
