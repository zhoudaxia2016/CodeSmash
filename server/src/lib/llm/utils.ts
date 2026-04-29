function stripTrailingCommasInJson(json: string): string {
  return json.replace(/,\s*(\]|\})/g, '$1')
}

function extractBalancedJsonObject(s: string): string | null {
  const start = s.indexOf('{')
  if (start < 0) return null
  let depth = 0
  let inStr = false
  let esc = false
  for (let i = start; i < s.length; i++) {
    const c = s[i]
    if (inStr) {
      if (esc) {
        esc = false
        continue
      }
      if (c === '\\') {
        esc = true
        continue
      }
      if (c === '"') inStr = false
      continue
    }
    if (c === '"') {
      inStr = true
      continue
    }
    if (c === '{') depth++
    else if (c === '}') {
      depth--
      if (depth === 0) return s.slice(start, i + 1)
    }
  }
  return null
}

export function tryParseJsonObjectFromText(raw: string): Record<string, unknown> | null {
  const cleaned = raw.trim()
  const attempts: string[] = [cleaned]
  for (const m of cleaned.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) {
    attempts.push(m[1].trim())
  }

  for (let chunk of attempts) {
    chunk = chunk.trim()
    if (!chunk) continue

    const tryOne = (s: string): Record<string, unknown> | null => {
      const t = s.trim()
      if (!t) return null
      try {
        const v = JSON.parse(t) as unknown
        if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>
      } catch {
        /* continue */
      }
      return null
    }

    const direct = tryOne(chunk)
    if (direct) return direct

    const balanced = extractBalancedJsonObject(chunk)
    if (balanced) {
      const a = tryOne(balanced)
      if (a) return a
      const b = tryOne(stripTrailingCommasInJson(balanced))
      if (b) return b
    }

    const i = chunk.indexOf('{')
    const j = chunk.lastIndexOf('}')
    if (i >= 0 && j > i) {
      const slice = chunk.slice(i, j + 1)
      const a = tryOne(slice)
      if (a) return a
      const b = tryOne(stripTrailingCommasInJson(slice))
      if (b) return b
    }
  }
  return null
}
