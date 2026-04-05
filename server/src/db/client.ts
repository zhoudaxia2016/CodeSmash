import { createClient, type Client } from '@libsql/client'

let cached: Client | undefined

/**
 * Shared libSQL client: `LIBSQL_URL` if set, else embedded file under `server/data/codesmash.db`.
 */
export function getLibsqlClient(): Client {
  if (cached) return cached
  const envUrl = Deno.env.get('LIBSQL_URL')?.trim()
  const url = envUrl ?? new URL('../../data/codesmash.db', import.meta.url).href
  const authToken = Deno.env.get('LIBSQL_AUTH_TOKEN')?.trim()
  cached = createClient({
    url,
    ...(authToken ? { authToken } : {}),
  })
  return cached
}
