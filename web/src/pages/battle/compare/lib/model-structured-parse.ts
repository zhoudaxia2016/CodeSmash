/**
 * Same contract as server `modelStructuredParse.ts` — extract runnable JS when the model
 * emits the structured JSON shape instead of free-form text.
 */

function tryParseJsonRoot(text: string): Record<string, unknown> | null {
  const t = text.trim()
  const attempts: string[] = [t]
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) attempts.push(fence[1].trim())
  for (const chunk of attempts) {
    try {
      const v = JSON.parse(chunk) as unknown
      if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>
    } catch {
      /* continue */
    }
    const i = chunk.indexOf('{')
    const j = chunk.lastIndexOf('}')
    if (i >= 0 && j > i) {
      try {
        const v = JSON.parse(chunk.slice(i, j + 1)) as unknown
        if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>
      } catch {
        /* continue */
      }
    }
  }
  return null
}

function pickSolution(obj: Record<string, unknown>): { thought: string; code: string } | null {
  const sol = obj['解决'] ?? obj['solution']
  if (!sol || typeof sol !== 'object' || Array.isArray(sol)) return null
  const s = sol as Record<string, unknown>
  const thoughtRaw = s['思考'] ?? s['thought']
  const codeRaw = s['代码'] ?? s['code']
  if (typeof codeRaw !== 'string' || !codeRaw.trim()) return null
  return {
    thought: typeof thoughtRaw === 'string' ? thoughtRaw : '',
    code: codeRaw.trim(),
  }
}

/** Raw JS body from structured JSON, or null if not structured. */
export function tryExtractStructuredCodeString(raw: string): string | null {
  const obj = tryParseJsonRoot(raw)
  if (!obj) return null
  const sol = pickSolution(obj)
  return sol?.code ?? null
}
