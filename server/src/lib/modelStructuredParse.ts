/**
 * Optional JSON shape (Chinese keys preferred; English aliases for flaky models):
 * Analysis phase: { "分析": "..." }
 * Code phase: { "解决": { "思考": "...", "代码": "..." } }
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

function pickAnalysis(obj: Record<string, unknown>): string | null {
  const v = obj['分析'] ?? obj['analysis']
  return typeof v === 'string' ? v : null
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

/** If the model followed the JSON-only analysis instruction, keep only 分析 text. */
export function normalizeAnalysisPhaseRaw(raw: string): string {
  const obj = tryParseJsonRoot(raw)
  if (!obj) return raw.trim()
  const a = pickAnalysis(obj)
  if (a != null && a.trim().length > 0) return a.trim()
  return raw.trim()
}

/**
 * Turn structured code-phase JSON into the same shape the UI expects (thinking XML + raw JS).
 * If parsing fails, return the original stream.
 */
export function normalizeCodePhaseRawForBattle(raw: string): string {
  const obj = tryParseJsonRoot(raw)
  if (!obj) return raw
  const sol = pickSolution(obj)
  if (!sol) return raw
  const think = sol.thought.trim()
  const js = sol.code
  if (think.length > 0) {
    return `<redacted_thinking>${think}</redacted_thinking>\n\n${js}`
  }
  return js
}

/** Runnable JS body from structured JSON, or null if not structured. */
export function tryExtractStructuredCodeString(raw: string): string | null {
  const obj = tryParseJsonRoot(raw)
  if (!obj) return null
  const sol = pickSolution(obj)
  return sol?.code ?? null
}
