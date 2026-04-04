/**
 * Same heuristics as web `stripCodeFences.ts`: split code-phase stream into
 * human-readable thinking vs JS body (before prepareRunnableJavaScript).
 */

const XML_THINKING_INNER: string[] = [
  '<redacted_thinking>([\\s\\S]*?)</redacted_thinking>',
  '<thinking>([\\s\\S]*?)</thinking>',
]

/**
 * Stream chunk may end inside `<redacted_thinking>` before `</…>` arrives.
 * Peel that tail into `parts` so it is not treated as runnable code.
 * If `function main` or a ``` fence appears inside the tail, split there.
 */
function peelOpenTagWithoutClose(
  s: string,
  open: string,
  close: string,
  parts: string[],
): string {
  const lc = s.toLowerCase()
  const oi = lc.lastIndexOf(open.toLowerCase())
  if (oi < 0) return s
  const afterOpen = oi + open.length
  if (s.toLowerCase().indexOf(close.toLowerCase(), afterOpen) >= 0) return s

  let inner = s.slice(afterOpen)
  const codeStart = inner.search(/(?:^|\n)\s*function\s+main\b/)
  if (codeStart >= 0) {
    const think = inner.slice(0, codeStart).trim()
    const codeRest = inner.slice(codeStart).trimStart()
    if (think) parts.push(think)
    return s.slice(0, oi) + codeRest
  }
  const fenceStart = inner.search(/(?:^|\n)\s*```(?:javascript|js)?\b/)
  if (fenceStart >= 0) {
    const think = inner.slice(0, fenceStart).trim()
    const codeRest = inner.slice(fenceStart)
    if (think) parts.push(think)
    return s.slice(0, oi) + codeRest
  }
  const t = inner.trim()
  if (t) parts.push(t)
  return s.slice(0, oi)
}

function peelAllUnclosedThinking(s: string, parts: string[]): string {
  let out = s
  out = peelOpenTagWithoutClose(out, '<redacted_thinking>', '</redacted_thinking>', parts)
  out = peelOpenTagWithoutClose(out, '<thinking>', '</thinking>', parts)
  return out
}

function removeLeakedThinkingMarkers(s: string): string {
  return s
    .replace(/<\/redacted_thinking>/gi, '\n')
    .replace(/<redacted_thinking>/gi, '\n')
    .replace(/<\/thinking>/gi, '\n')
    .replace(/<thinking>/gi, '\n')
}

/** Strip XML-style thinking wrappers (analysis + code-phase thinking for markdown UI). */
export function sanitizeModelThoughtMarkdown(s: string): string {
  let t = s
  t = t.replace(/<redacted_thinking>([\s\S]*?)<\/redacted_thinking>/gi, '$1')
  t = t.replace(/<thinking>([\s\S]*?)<\/thinking>/gi, '$1')
  t = removeLeakedThinkingMarkers(t)
  return t.replace(/\n{3,}/g, '\n\n').trim()
}

function extractLastMainBlock(s: string): { prefix: string; code: string } {
  const re = /^function\s+main\b/gm
  const idx: number[] = []
  let m: RegExpExecArray | null
  const r = new RegExp(re.source, 'gm')
  while ((m = r.exec(s)) !== null) idx.push(m.index)
  if (idx.length < 2) return { prefix: '', code: s }
  const start = idx[idx.length - 1]!
  return { prefix: s.slice(0, start).trim(), code: s.slice(start).trim() }
}

function splitLeadingProseBeforeFence(s: string): { prose: string; rest: string } {
  const trimmed = s.replace(/\n{3,}/g, '\n\n').trim()
  const idx = trimmed.search(/```(?:javascript|js)?/)
  if (idx <= 0) return { prose: '', rest: trimmed }
  const prose = trimmed.slice(0, idx).trim()
  const fromFence = trimmed.slice(idx)
  const closed = fromFence.match(/^```(?:javascript|js)?\s*([\s\S]*?)```/)
  if (closed) {
    const inner = closed[1].trim()
    const tail = fromFence.slice(closed[0].length).trim()
    const code = tail ? `${inner}\n\n${tail}` : inner
    return { prose, rest: code }
  }
  const open = fromFence.match(/^```(?:javascript|js)?\s*\n?([\s\S]*)$/)
  if (open) return { prose, rest: open[1].trim() }
  return { prose: '', rest: trimmed }
}

export function splitThinkingFromModelCode(raw: string): { thinking: string; code: string } {
  const parts: string[] = []
  let s = peelAllUnclosedThinking(raw, parts)
  for (const body of XML_THINKING_INNER) {
    const re = new RegExp(body, 'gi')
    s = s.replace(re, (_m, inner: string) => {
      const t = inner.trim()
      if (t) parts.push(t)
      return '\n'
    })
  }
  s = removeLeakedThinkingMarkers(s).replace(/\n{3,}/g, '\n\n').trim()
  const { prose, rest } = splitLeadingProseBeforeFence(s)
  if (prose) parts.push(prose)
  const { prefix, code: lastMain } = extractLastMainBlock(rest.trim())
  if (prefix) parts.push(prefix)
  return {
    thinking: sanitizeModelThoughtMarkdown(parts.join('\n\n───\n\n')),
    code: lastMain.trim(),
  }
}
