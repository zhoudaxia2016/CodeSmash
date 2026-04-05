/** 与 server `THINKING_OPEN_TAG_RE` / 常见闭标签一致，用于判断是否还有未拆 XML（旧快照兜底）。 */
export function rawCodeStillHasThinkingXml(raw: string): boolean {
  return (
    /<redacted_thinking\b/i.test(raw) ||
    /<\/redacted_thinking>/i.test(raw) ||
    /<thinking\b/i.test(raw) ||
    /<\/thinking>/i.test(raw) ||
    /<think\b/i.test(raw) ||
    /<\/think>/i.test(raw) ||
    /<reasoning\b/i.test(raw) ||
    /<\/reasoning>/i.test(raw) ||
    /<thought\b/i.test(raw) ||
    /<\/thought>/i.test(raw)
  )
}
