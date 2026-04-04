/**
 * Match server `stripInterleavedThinking` + `stripCodeFences` before QuickJS run.
 * Battle UI keeps raw `result.code` (thinking + code); execution uses `prepareRunnableJavaScript`.
 */
const INTERTHINKING_BLOCK_RES: RegExp[] = [
  /<redacted_thinking>[\s\S]*?<\/redacted_thinking>/gi,
  /<thinking>[\s\S]*?<\/thinking>/gi,
]

const XML_THINKING_INNER: string[] = [
  '<redacted_thinking>([\\s\\S]*?)</redacted_thinking>',
  '<thinking>([\\s\\S]*?)</thinking>',
]

/** MiniMax / models sometimes leak closing tags or bare markers into `content`. */
function removeLeakedThinkingMarkers(s: string): string {
  return s
    .replace(/<\/redacted_thinking>/gi, '\n')
    .replace(/<redacted_thinking>/gi, '\n')
    .replace(/<\/thinking>/gi, '\n')
    .replace(/<thinking>/gi, '\n')
}

/**
 * Multiple top-level `function main` blocks: keep the last as final code; earlier + sandwiched prose → thinking.
 * Matches MiniMax streaming code first, then meta-prose, stray `</redacted_thinking>`, then final code.
 */
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

/**
 * After XML blocks: treat non-empty text before first ```js``` as thinking (MiniMax often streams prose then a fence).
 */
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

/** Pull thinking out for collapsible UI; code is suitable for highlight + stripCodeFences + runner. */
export function splitThinkingFromModelCode(raw: string): { thinking: string; code: string } {
  const parts: string[] = []
  let s = raw
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
    thinking: parts.join('\n\n───\n\n'),
    code: lastMain.trim(),
  }
}

export function stripInterleavedThinking(text: string): string {
  let s = text
  for (const re of INTERTHINKING_BLOCK_RES) {
    s = s.replace(re, '\n')
  }
  return s.trim()
}

/** Keeps text before/after first ``` fence (e.g. interleaved thinking + fenced JS). */
export function stripCodeFences(text: string): string {
  const trimmed = text.trim()
  const fenceRe = /```(?:javascript|js)?\s*([\s\S]*?)```/
  const m = trimmed.match(fenceRe)
  if (!m || m.index === undefined) return trimmed
  const prefix = trimmed.slice(0, m.index).trim()
  const inner = m[1].trim()
  const after = trimmed.slice(m.index + m[0].length).trim()
  let body = prefix ? `${prefix}\n\n${inner}` : inner
  if (after) body = `${body}\n\n${after}`
  return body.trim()
}

export function prepareRunnableJavaScript(text: string): string {
  const { code } = splitThinkingFromModelCode(text)
  return stripCodeFences(stripInterleavedThinking(code))
}
