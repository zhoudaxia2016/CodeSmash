import { useEffect, useLayoutEffect, useRef } from 'react'
import { MAIN_STICK_NEAR_PX } from '../lib/battlePhaseLayout'

type Props = {
  battleId: string
  force: boolean
  thoughtA?: string
  codeA?: string
  thoughtB?: string
  codeB?: string
  runDoneA?: number
  runDoneB?: number
}

/** 对战内容变高时滚动外层 <main>；force 为流式对战时强制粘底（官方用例重跑不 force） */
export function MainAutoScroll({
  battleId,
  force,
  thoughtA,
  codeA,
  thoughtB,
  codeB,
  runDoneA,
  runDoneB,
}: Props) {
  /** 默认不粘底：刷新/进入页时留在顶部；用户滚到底部后才随内容增高跟随 */
  const stickRef = useRef(false)
  useLayoutEffect(() => {
    stickRef.current = false
  }, [battleId])

  useLayoutEffect(() => {
    const main = document.querySelector('main')
    if (!main) return
    if (force || stickRef.current) {
      main.scrollTop = main.scrollHeight
    }
  }, [force, battleId, thoughtA, codeA, thoughtB, codeB, runDoneA, runDoneB])

  useEffect(() => {
    const main = document.querySelector('main')
    if (!main) return
    const onScroll = () => {
      if (force) return
      const d = main.scrollHeight - main.scrollTop - main.clientHeight
      stickRef.current = d <= MAIN_STICK_NEAR_PX
    }
    main.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => main.removeEventListener('scroll', onScroll)
  }, [force])

  return null
}
