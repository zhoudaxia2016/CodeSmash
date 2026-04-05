import { tryExtractStructuredCodeString } from '@/lib/modelStructuredParse'

/**
 * 与 server `codePhaseSplit.ts` 同步：`ThinkingTagSpec` + `THINKING_TAGS` + `thinkingCloseLiteral`。
 */
export type ThinkingTagSpec = { readonly openName: string; readonly closeTag?: string }

export function thinkingCloseLiteral(spec: ThinkingTagSpec): string {
  return `</${spec.closeTag ?? spec.openName}>`
}

export const THINKING_TAGS: readonly ThinkingTagSpec[] = [
  { openName: 'redacted_thinking' },
  { openName: 'thinking' },
  { openName: 'think' },
  { openName: 'reasoning' },
  { openName: 'thought' },
] as const

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function findEarliestThinkingOpen(s: string): {
  start: number
  openLen: number
  closeLiteral: string
} | null {
  let best: { start: number; openLen: number; closeLiteral: string } | null = null
  for (const spec of THINKING_TAGS) {
    const { openName } = spec
    const re = new RegExp(`<${openName}\\b[^>]*>`, 'i')
    const m = re.exec(s)
    if (!m || m.index === undefined) continue
    const closeLiteral = thinkingCloseLiteral(spec)
    if (!best || m.index < best.start) {
      best = { start: m.index, openLen: m[0].length, closeLiteral }
    }
  }
  return best
}

export function sanitizeCodingThoughtForDisplay(s: string): string {
  return s.replace(/\n{3,}/g, '\n\n').trim()
}

function stripThinkingXmlForInterleaved(s: string): string {
  let t = s
  for (const spec of THINKING_TAGS) {
    const { openName } = spec
    const closeLiteral = thinkingCloseLiteral(spec)
    const closeEsc = escapeRegExp(closeLiteral)
    const pair = new RegExp(`<${openName}\\b[^>]*>[\\s\\S]*?${closeEsc}`, 'gi')
    t = t.replace(pair, '\n')
  }
  for (const { openName } of THINKING_TAGS) {
    t = t.replace(new RegExp(`<${openName}\\b[^>]*>[\\s\\S]*$`, 'gi'), '\n')
  }
  for (const spec of THINKING_TAGS) {
    const { openName } = spec
    const closeLiteral = thinkingCloseLiteral(spec)
    t = t.replace(new RegExp(escapeRegExp(closeLiteral), 'gi'), '\n')
    t = t.replace(new RegExp(`<${openName}\\b[^>]*>`, 'gi'), '\n')
  }
  return t.replace(/\n{3,}/g, '\n\n').trim()
}

export function splitThinkingFromModelCode(raw: string): { thinking: string; code: string } {
  const parts: string[] = []
  let s = raw
  while (true) {
    const op = findEarliestThinkingOpen(s)
    if (!op) break
    const afterOpen = op.start + op.openLen
    const closeIdx = s.toLowerCase().indexOf(op.closeLiteral.toLowerCase(), afterOpen)
    if (closeIdx < 0) {
      const inner = s.slice(afterOpen).trim()
      if (inner) parts.push(inner)
      s = s.slice(0, op.start)
      break
    }
    const inner = s.slice(afterOpen, closeIdx).trim()
    if (inner) parts.push(inner)
    s = s.slice(0, op.start) + '\n' + s.slice(closeIdx + op.closeLiteral.length)
  }
  return {
    thinking: parts.join('\n\n───\n\n').trim(),
    code: s.replace(/\n{3,}/g, '\n\n').trim(),
  }
}

export function mergeReasoningAndXmlCodingThought(reasoning: string, xmlThinking: string): string {
  return [reasoning.trim(), xmlThinking.trim()].filter(Boolean).join('\n\n───\n\n').replace(/\n{3,}/g, '\n\n').trim()
}

export function stripInterleavedThinking(text: string): string {
  return stripThinkingXmlForInterleaved(text)
}

export function stripCodeFences(text: string): string {
  const t = text.trim()
  const m = t.match(/```(?:javascript|js)?\s*([\s\S]*?)```/)
  return m ? m[1].trim() : t
}

function shouldTryStructuredCodeExtract(s: string): boolean {
  const t = s.trimStart()
  return t.startsWith('{') || t.startsWith('[') || /^```(?:json)?\b/i.test(t)
}

export function finalizeRunnableFromCodeOnly(code: string): string {
  const t = code.trim()
  const base = shouldTryStructuredCodeExtract(t) ? (tryExtractStructuredCodeString(t) ?? t) : t
  return stripCodeFences(base).trim()
}

export function prepareRunnableJavaScript(text: string): string {
  const { code } = splitThinkingFromModelCode(text.trim())
  return finalizeRunnableFromCodeOnly(code)
}
