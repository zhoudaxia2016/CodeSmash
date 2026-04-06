import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { api } from '@/api/client'
import { useBattleModelSide } from '@/hooks/useBattleModelSide'
import type { BattleSession, ModelResult, ProblemGradingContext, TestCase } from '@/types'
import {
  battleRoundTabCountForModel,
  currentBattleRound,
  latestRoundLlmMayGrow,
  roundHasAnalysisContent,
  roundShowsCodePhase,
  roundShowsOfficialPhase,
  viewRoundForTab,
} from '@/utils/battle-round'
import { ModelRoundBar } from './model-round-bar'
import { AnalysisCell } from './cells/analysis-cell'
import { CodeCell, comparableCodeFromRound } from './cells/code-cell'
import { OfficialCell } from './cells/official-cell'
import { MainAutoScroll } from './main-auto-scroll'
import {
  ColumnHeader,
  PhaseColumnHeading,
  PhasePairedPlaceholder,
} from './phase-chrome'

export type CompareProps = {
  battleId: string
  modelAName: string
  modelBName: string
  resultA: ModelResult
  resultB: ModelResult
  testCases: TestCase[]
  testsReady: boolean
  grading: ProblemGradingContext
  submitOfficialToServer?: boolean
  streamBattle?: boolean
  battleStatus: BattleSession['status']
}

function initialRoundTabIndex(len: number): number {
  return len > 0 ? len - 1 : 0
}

export function Compare({
  battleId,
  modelAName,
  modelBName,
  resultA,
  resultB,
  testCases,
  testsReady,
  grading,
  submitOfficialToServer = true,
  streamBattle = false,
  battleStatus,
}: CompareProps) {
  const queryClient = useQueryClient()
  const hookA = useBattleModelSide({
    battleId,
    side: 'modelA',
    result: resultA,
    testCases,
    testsReady,
    grading,
    submitOfficialToServer,
  })
  const hookB = useBattleModelSide({
    battleId,
    side: 'modelB',
    result: resultB,
    testCases,
    testsReady,
    grading,
    submitOfficialToServer,
  })

  const lenA = resultA.result.length
  const lenB = resultB.result.length
  const tabCountA = battleRoundTabCountForModel(resultA)
  const tabCountB = battleRoundTabCountForModel(resultB)

  const [roundTabA, setRoundTabA] = useState(() => initialRoundTabIndex(lenA))
  const [roundTabB, setRoundTabB] = useState(() => initialRoundTabIndex(lenB))
  const prevLenARef = useRef(lenA)
  const prevLenBRef = useRef(lenB)
  const [refineErrorSide, setRefineErrorSide] = useState<'modelA' | 'modelB' | null>(null)

  useEffect(() => {
    if (lenA > prevLenARef.current) {
      setRoundTabA(Math.max(0, lenA - 1))
    }
    prevLenARef.current = lenA
    setRoundTabA((i) => Math.min(i, Math.max(0, lenA - 1)))
  }, [lenA])

  useEffect(() => {
    if (lenB > prevLenBRef.current) {
      setRoundTabB(Math.max(0, lenB - 1))
    }
    prevLenBRef.current = lenB
    setRoundTabB((i) => Math.min(i, Math.max(0, lenB - 1)))
  }, [lenB])

  const viewA = viewRoundForTab(resultA, roundTabA, hookA.displayResult)
  const viewB = viewRoundForTab(resultB, roundTabB, hookB.displayResult)
  const latestA = lenA > 0 && roundTabA === lenA - 1
  const latestB = lenB > 0 && roundTabB === lenB - 1

  const refineMutation = useMutation({
    mutationFn: (p: {
      side: 'modelA' | 'modelB'
      userMessage: string
      includeFailedCases: boolean
    }) => api.refineBattle(battleId, p),
    onMutate: () => setRefineErrorSide(null),
    onSuccess: () => {
      setRefineErrorSide(null)
      void queryClient.invalidateQueries({ queryKey: ['battles', battleId] })
    },
    onError: (_e, v) => setRefineErrorSide(v.side),
  })

  const refineBridgeA =
    submitOfficialToServer
      ? {
          submit: (payload: { userMessage: string; includeFailedCases: boolean }) =>
            refineMutation.mutate({
              side: 'modelA',
              userMessage: payload.userMessage,
              includeFailedCases: payload.includeFailedCases,
            }),
          isPending: refineMutation.isPending,
          isError: refineMutation.isError,
          error: refineMutation.error instanceof Error ? refineMutation.error : null,
        }
      : null

  const refineBridgeB =
    submitOfficialToServer
      ? {
          submit: (payload: { userMessage: string; includeFailedCases: boolean }) =>
            refineMutation.mutate({
              side: 'modelB',
              userMessage: payload.userMessage,
              includeFailedCases: payload.includeFailedCases,
            }),
          isPending: refineMutation.isPending,
          isError: refineMutation.isError,
          error: refineMutation.error instanceof Error ? refineMutation.error : null,
        }
      : null

  const battleBusy = battleStatus === 'running'

  const refineDisabledA = battleBusy || !latestA || !hookA.ok || lenA === 0
  const refineDisabledB = battleBusy || !latestB || !hookB.ok || lenB === 0

  const refineTitleA =
    refineBridgeA && refineDisabledA
      ? battleBusy
        ? '生成中，请稍候'
        : !latestA
          ? '请切换到最新一轮后再追问'
          : !hookA.ok
            ? '请先完成本轮评测后再追问'
            : '暂不可追问'
      : undefined

  const refineTitleB =
    refineBridgeB && refineDisabledB
      ? battleBusy
        ? '生成中，请稍候'
        : !latestB
          ? '请切换到最新一轮后再追问'
          : !hookB.ok
            ? '请先完成本轮评测后再追问'
            : '暂不可追问'
      : undefined

  const prevCodeA =
    roundTabA > 0 ? comparableCodeFromRound(viewRoundForTab(resultA, roundTabA - 1, hookA.displayResult)) : ''
  const prevCodeB =
    roundTabB > 0 ? comparableCodeFromRound(viewRoundForTab(resultB, roundTabB - 1, hookB.displayResult)) : ''

  const showAnalysisSection = roundHasAnalysisContent(viewA) || roundHasAnalysisContent(viewB)
  const showCodeSection = roundShowsCodePhase(viewA) || roundShowsCodePhase(viewB)
  const showOfficialSection = roundShowsOfficialPhase(viewA) || roundShowsOfficialPhase(viewB)

  /** 仅首轮流式时跟滚外层 main；第 2 轮起不再拖动画布，分析/代码区内仍由各 Cell 的 stick-to-bottom 跟滚 */
  const mainScrollForce =
    streamBattle && Math.max(lenA, lenB) < 2
  const followAutoScrollA = latestRoundLlmMayGrow(currentBattleRound(resultA))
  const followAutoScrollB = latestRoundLlmMayGrow(currentBattleRound(resultB))

  return (
    <>
      <MainAutoScroll
        battleId={battleId}
        force={mainScrollForce}
        followContentA={followAutoScrollA}
        followContentB={followAutoScrollB}
        thoughtA={currentBattleRound(resultA)?.thought}
        codeA={currentBattleRound(resultA)?.code}
        thoughtB={currentBattleRound(resultB)?.thought}
        codeB={currentBattleRound(resultB)?.code}
        runDoneA={hookA.runProgress?.done}
        runDoneB={hookB.runProgress?.done}
      />
      {/*
        每侧一列纵向排布，sticky 父级须包含该侧全部可滚内容；若 sticky 只在「仅含头部」的短容器里，
        父高≈头高，CSS sticky 无法相对 main 吸顶。
      */}
      <div className="flex min-h-0 min-w-0 flex-col gap-4">
        <div className="grid min-h-0 grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2 sm:items-start">
          <div className="flex min-h-0 min-w-0 flex-col gap-4">
            <div className="sticky top-0 z-30 space-y-2 border-b border-border/80 bg-background/95 py-2 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/85">
              <ColumnHeader label={modelAName} hook={hookA} />
              <ModelRoundBar
                tabCount={tabCountA}
                selectedIndex={roundTabA}
                onSelect={setRoundTabA}
                refine={
                  refineBridgeA
                    ? {
                        bridge: refineBridgeA,
                        disabled: refineDisabledA,
                        disabledTitle: refineTitleA,
                        showError: refineMutation.isError && refineErrorSide === 'modelA',
                      }
                    : null
                }
              />
            </div>
            {showAnalysisSection && (
              <section className="flex min-h-0 min-w-0 flex-col gap-2">
                <PhaseColumnHeading>1 · 分析</PhaseColumnHeading>
                <AnalysisCell battleId={battleId} viewRound={viewA} isViewingLatest={latestA} />
              </section>
            )}
            {showCodeSection && (
              <section className="flex min-h-0 min-w-0 flex-col gap-2">
                <PhaseColumnHeading>2 · 代码</PhaseColumnHeading>
                {roundShowsCodePhase(viewA) ? (
                  <CodeCell
                    battleId={battleId}
                    viewRound={viewA}
                    isViewingLatest={latestA}
                    previousComparableCode={prevCodeA || undefined}
                  />
                ) : (
                  <PhasePairedPlaceholder>
                    {viewA === undefined ? '该模型尚无这一轮输出。' : '等待分析完成…'}
                  </PhasePairedPlaceholder>
                )}
              </section>
            )}
            {showOfficialSection && (
              <section className="flex min-h-0 min-w-0 flex-col gap-2">
                <PhaseColumnHeading>3 · 执行测试</PhaseColumnHeading>
                {roundShowsOfficialPhase(viewA) ? (
                  <OfficialCell hook={hookA} viewRound={viewA} isViewingLatest={latestA} />
                ) : (
                  <PhasePairedPlaceholder>
                    {viewA === undefined ? '该模型尚无这一轮输出。' : '等待代码阶段完成…'}
                  </PhasePairedPlaceholder>
                )}
              </section>
            )}
          </div>

          <div className="flex min-h-0 min-w-0 flex-col gap-4">
            <div className="sticky top-0 z-30 space-y-2 border-b border-border/80 bg-background/95 py-2 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/85">
              <ColumnHeader label={modelBName} hook={hookB} />
              <ModelRoundBar
                tabCount={tabCountB}
                selectedIndex={roundTabB}
                onSelect={setRoundTabB}
                refine={
                  refineBridgeB
                    ? {
                        bridge: refineBridgeB,
                        disabled: refineDisabledB,
                        disabledTitle: refineTitleB,
                        showError: refineMutation.isError && refineErrorSide === 'modelB',
                      }
                    : null
                }
              />
            </div>
            {showAnalysisSection && (
              <section className="flex min-h-0 min-w-0 flex-col gap-2">
                <PhaseColumnHeading>1 · 分析</PhaseColumnHeading>
                <AnalysisCell battleId={battleId} viewRound={viewB} isViewingLatest={latestB} />
              </section>
            )}
            {showCodeSection && (
              <section className="flex min-h-0 min-w-0 flex-col gap-2">
                <PhaseColumnHeading>2 · 代码</PhaseColumnHeading>
                {roundShowsCodePhase(viewB) ? (
                  <CodeCell
                    battleId={battleId}
                    viewRound={viewB}
                    isViewingLatest={latestB}
                    previousComparableCode={prevCodeB || undefined}
                  />
                ) : (
                  <PhasePairedPlaceholder>
                    {viewB === undefined ? '该模型尚无这一轮输出。' : '等待分析完成…'}
                  </PhasePairedPlaceholder>
                )}
              </section>
            )}
            {showOfficialSection && (
              <section className="flex min-h-0 min-w-0 flex-col gap-2">
                <PhaseColumnHeading>3 · 执行测试</PhaseColumnHeading>
                {roundShowsOfficialPhase(viewB) ? (
                  <OfficialCell hook={hookB} viewRound={viewB} isViewingLatest={latestB} />
                ) : (
                  <PhasePairedPlaceholder>
                    {viewB === undefined ? '该模型尚无这一轮输出。' : '等待代码阶段完成…'}
                  </PhasePairedPlaceholder>
                )}
              </section>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
