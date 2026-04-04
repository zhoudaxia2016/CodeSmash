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

/** 对战内容变高时滚动外层 <main>；流式 / 跑官方用例时强制粘底 */
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
  const stickRef = useRef(true)
  useLayoutEffect(() => {
    stickRef.current = true
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
