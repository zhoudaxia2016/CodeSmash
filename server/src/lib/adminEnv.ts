function normalizeGithubIdToken(s: string): string {
  let t = s.trim()
  if (
    (t.startsWith('"') && t.endsWith('"')) ||
    (t.startsWith("'") && t.endsWith("'"))
  ) {
    t = t.slice(1, -1).trim()
  }
  return t
}

/** GitHub numeric user ids from `ADMIN_GITHUB_IDS` (comma-separated). */
export function parseAdminGithubIds(): Set<string> {
  const raw = Deno.env.get('ADMIN_GITHUB_IDS')?.trim() ?? ''
  if (!raw) return new Set()
  return new Set(
    raw
      .split(',')
      .map((s) => normalizeGithubIdToken(s))
      .filter(Boolean),
  )
}
