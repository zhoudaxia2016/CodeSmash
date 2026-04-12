import {
  useCallback,
  useLayoutEffect,
  useRef,
  type RefObject,
} from 'react'

const NEAR_BOTTOM_PX = 80

type Opts = {
  resetKey?: string
  force?: boolean
  /** 内容变化时触发滚底（如流式字符串、长度） */
  syncKey: string | number
  /** 为 false 时不粘底、不挂 ResizeObserver */
  enabled?: boolean
  /** 滚动容器；不传则 hook 内部创建 ref */
  scrollRef?: RefObject<HTMLDivElement | null>
  /**
   * 监听该节点尺寸变化并再次粘底（Markdown、高亮等异步增高）。
   * 须为滚动容器内部会随内容变高的节点。
   */
  observeSizeRef?: RefObject<Element | null>
}

/**
 * 将 scrollable 容器在内容增长时滚到底部；force 为 true 时流式阶段始终粘底。
 */
export function useStickToBottomScroll(opts: Opts) {
  const internalRef = useRef<HTMLDivElement>(null)
  const ref = opts.scrollRef ?? internalRef
  const stickRef = useRef(true)
  const { resetKey, force = false, syncKey, enabled = true, observeSizeRef } = opts

  useLayoutEffect(() => {
    stickRef.current = true
  }, [resetKey])

  const onScroll = useCallback(() => {
    if (force) return
    const el = ref.current
    if (!el) return
    const d = el.scrollHeight - el.scrollTop - el.clientHeight
    stickRef.current = d <= NEAR_BOTTOM_PX
  }, [force, ref])

  useLayoutEffect(() => {
    if (!enabled) return
    const applyStick = () => {
      const box = ref.current
      if (!box) return
      if (force || stickRef.current) {
        box.scrollTop = box.scrollHeight
      }
    }
    applyStick()
    const target = observeSizeRef?.current
    if (!target) return
    const ro = new ResizeObserver(applyStick)
    ro.observe(target)
    return () => ro.disconnect()
  }, [enabled, force, resetKey, syncKey, observeSizeRef, ref])

  return {
    ref: ref as RefObject<HTMLDivElement>,
    onScroll,
  } as const
}
