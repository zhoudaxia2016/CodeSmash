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

/** 对战内容变高时滚动外层 <main>；流式对战默认粘底，用户离开底部后不再自动滚；非流式仅当已在底部时跟随增高 */
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
  const stickRef = useRef(false)
  useLayoutEffect(() => {
    stickRef.current = force
  }, [battleId, force])

  useLayoutEffect(() => {
    const main = document.querySelector('main')
    if (!main) return
    if (stickRef.current) {
      main.scrollTop = main.scrollHeight
    }
  }, [force, battleId, thoughtA, codeA, thoughtB, codeB, runDoneA, runDoneB])

  useEffect(() => {
    const main = document.querySelector('main')
    if (!main) return
    const onScroll = () => {
      const d = main.scrollHeight - main.scrollTop - main.clientHeight
      stickRef.current = d <= MAIN_STICK_NEAR_PX
    }
    main.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => main.removeEventListener('scroll', onScroll)
  }, [])

  return null
}
