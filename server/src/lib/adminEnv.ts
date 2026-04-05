/** GitHub numeric user ids from `ADMIN_GITHUB_IDS` (comma-separated). */
export function parseAdminGithubIds(): Set<string> {
  const raw = Deno.env.get('ADMIN_GITHUB_IDS')?.trim() ?? ''
  if (!raw) return new Set()
  return new Set(
    raw.split(',').map((s) => s.trim()).filter(Boolean),
  )
}
