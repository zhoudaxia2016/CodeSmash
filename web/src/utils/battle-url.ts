/** 当前页面对战详情入口：`?battle=` / `?replay=` */
export function readBattleDetailIdFromUrl(): string | null {
  if (typeof window === 'undefined') return null
  const q = new URLSearchParams(window.location.search)
  return q.get('battle') ?? q.get('replay')
}
