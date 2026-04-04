import { useCallback, useLayoutEffect, useRef } from 'react'

const NEAR_BOTTOM_PX = 80

type Opts = {
  resetKey?: string
  force?: boolean
  /** 内容变化时触发滚底（如流式字符串、长度） */
  syncKey: string | number
}

/**
 * 将 scrollable 容器在内容增长时滚到底部；force 为 true 时流式阶段始终粘底。
 */
export function useStickToBottomScroll(opts: Opts) {
  const ref = useRef<HTMLDivElement>(null)
  const stickRef = useRef(true)
  const { resetKey, force = false, syncKey } = opts

  useLayoutEffect(() => {
    stickRef.current = true
  }, [resetKey])

  const onScroll = useCallback(() => {
    if (force) return
    const el = ref.current
    if (!el) return
    const d = el.scrollHeight - el.scrollTop - el.clientHeight
    stickRef.current = d <= NEAR_BOTTOM_PX
  }, [force])

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    if (force || stickRef.current) {
      el.scrollTop = el.scrollHeight
    }
  }, [force, resetKey, syncKey])

  return { ref, onScroll } as const
}
