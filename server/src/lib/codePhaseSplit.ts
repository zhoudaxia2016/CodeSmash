/**
 * 代码阶段：从 content 里抽出各模型常见的「思考」XML 块，余下为 code。
 * - `splitThinkingFromModelCode`：按开标签在串中最先出现顺序依次抠块（非贪婪到对应闭标签）。
 * - 流式：`battles` 用 `THINKING_OPEN_TAG_RE` 判断是否已进入思考区，不在此做块级解析。
 * 新增厂商标签时只改 `THINKING_TAGS`（并与 `web/src/lib/stripCodeFences.ts` 同步）。
 */

export type ThinkingTagSpec = { readonly openName: string; readonly closeTag?: string }

/** 闭标签字符串。仅当开闭「本地名」不一致时写 `closeTag`（如 Qwen：`<think>` → `</redacted_thinking>`）。 */
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

/** 任一思考开标签（可带属性）——流式时用于「整段先当 codingThought」。 */
export const THINKING_OPEN_TAG_RE =
  /<(redacted_thinking|thinking|think|reasoning|thought)\b[^>]*>/i

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

/** 分析阶段等：只做空白整理。 */
export function sanitizeModelThoughtMarkdown(s: string): string {
  return s.replace(/\n{3,}/g, '\n\n').trim()
}

/**
 * 捕获的各块 inner 拼成 codingThought，去掉所有块后余下为 code。
 */
export function splitThinkingFromModelCode(raw: string): { thinking: string; code: string } {
  const parts: string[] = []
  let s = raw
  while (true) {
    const op = findEarliestThinkingOpen(s)
    if (!op) break
    const afterOpen = op.start + op.openLen
    const closeIdx = s.toLowerCase().indexOf(op.closeLiteral.toLowerCase(), afterOpen)
    if (closeIdx < 0) {
      // MiniMax 等可能流式结束仍未输出 </…>：开标签后的整段视为思考，避免 code 里残留半截 XML
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

/** API reasoning 通道 + 从 content 解析出的 XML 思考文本。 */
export function mergeReasoningAndXmlCodingThought(reasoning: string, xmlThinking: string): string {
  return [reasoning.trim(), xmlThinking.trim()].filter(Boolean).join('\n\n───\n\n').replace(/\n{3,}/g, '\n\n').trim()
}
