export function rawCodeStillHasThinkingXml(raw: string): boolean {
  return (
    /<redacted_thinking/i.test(raw) ||
    /<\/redacted_thinking>/i.test(raw) ||
    /<thinking>/i.test(raw) ||
    /<\/thinking>/i.test(raw)
  )
}
