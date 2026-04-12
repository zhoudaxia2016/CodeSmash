export function parseLlmCallMessages(jsonStr: string): { role: string; content: string }[] {
  try {
    const v = JSON.parse(jsonStr) as unknown
    if (!Array.isArray(v)) return [{ role: 'raw', content: jsonStr }]
    return v.map((m) => {
      if (m && typeof m === 'object' && 'role' in m) {
        const r = m as { role: unknown; content?: unknown }
        return {
          role: String(r.role),
          content: typeof r.content === 'string' ? r.content : JSON.stringify(r.content ?? null, null, 2),
        }
      }
      return { role: 'message', content: JSON.stringify(m) }
    })
  } catch {
    return [{ role: 'raw', content: jsonStr }]
  }
}

export type LlmOutputMarkdownField = { key: string; markdown: string }

/** Raw `mode` from output_json (plain text in UI, not markdown). */
export function parseLlmOutputMode(outputJson: string | null): string | null {
  if (!outputJson?.trim()) return null
  try {
    const o = JSON.parse(outputJson) as Record<string, unknown>
    if (!o || typeof o !== 'object') return null
    const m = o.mode
    if (m === undefined || m === null) return null
    return typeof m === 'string' ? m : String(m)
  } catch {
    return null
  }
}

/** Renders each value as markdown; omits `mode` (show mode separately as plain text). */
export function outputJsonToMarkdownFields(outputJson: string | null): LlmOutputMarkdownField[] {
  if (!outputJson?.trim()) return []
  try {
    const o = JSON.parse(outputJson) as Record<string, unknown>
    if (!o || typeof o !== 'object') {
      return [{ key: 'raw', markdown: '```\n' + outputJson + '\n```' }]
    }
    const keys = Object.keys(o).filter((k) => k !== 'mode').sort()
    const out: LlmOutputMarkdownField[] = []
    for (const k of keys) {
      const v = o[k]
      if (v === undefined) continue
      if (typeof v === 'string') {
        out.push({ key: k, markdown: v })
      } else {
        out.push({
          key: k,
          markdown: '```json\n' + JSON.stringify(v, null, 2) + '\n```',
        })
      }
    }
    return out
  } catch {
    return [{ key: 'raw', markdown: '```\n' + outputJson + '\n```' }]
  }
}
