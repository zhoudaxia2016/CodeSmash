/** 展示用耗时（秒）；hover 的 title 可再附原始 ms。 */
export function formatDurationSeconds(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '0s'
  const s = ms / 1000
  const decimals = s < 10 ? 2 : 1
  const t = Number(s.toFixed(decimals)).toString()
  return `${t}s`
}
