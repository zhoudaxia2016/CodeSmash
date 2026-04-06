import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { MAIN_STICK_NEAR_PX } from '../lib/battlePhaseLayout'

type Props = {
  battleId: string
  force: boolean
  /** 为 false 时，该侧 thought/code/runDone 变化不触发粘底（另一侧不受影响） */
  followContentA: boolean
  followContentB: boolean
  thoughtA?: string
  codeA?: string
  thoughtB?: string
  codeB?: string
  runDoneA?: number
  runDoneB?: number
}

function sideScrollFingerprint(
  follow: boolean,
  thought: string | undefined,
  code: string | undefined,
  runDone: number | undefined,
): string {
  if (!follow) return '\0'
  return `${thought ?? ''}\0${code ?? ''}\0${runDone ?? ''}`
}

/** 对战内容变高时滚动外层 <main>；流式对战默认粘底，用户离开底部后不再自动滚 */
export function MainAutoScroll({
  battleId,
  force,
  followContentA,
  followContentB,
  thoughtA,
  codeA,
  thoughtB,
  codeB,
  runDoneA,
  runDoneB,
}: Props) {
  const stickRef = useRef(false)

  const scrollSyncKey = useMemo(
    () =>
      `${battleId}|${force}|${sideScrollFingerprint(followContentA, thoughtA, codeA, runDoneA)}|${sideScrollFingerprint(followContentB, thoughtB, codeB, runDoneB)}`,
    [
      battleId,
      force,
      followContentA,
      followContentB,
      thoughtA,
      codeA,
      thoughtB,
      codeB,
      runDoneA,
      runDoneB,
    ],
  )

  useLayoutEffect(() => {
    stickRef.current = force
  }, [battleId, force])

  useLayoutEffect(() => {
    const main = document.querySelector('main')
    if (!main || !stickRef.current) return
    main.scrollTop = main.scrollHeight
  }, [scrollSyncKey])

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
