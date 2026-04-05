import { useBattleModelSide } from '@/hooks/useBattleModelSide'
import { AnalysisCell } from './cells/analysis-cell'
import { MainAutoScroll } from './main-auto-scroll'
import {
  ColumnHeader,
  PhaseColumnHeading,
  PhasePairedPlaceholder,
} from './phase-chrome'
import { CodeCell } from './cells/code-cell'
import { OfficialCell } from './cells/official-cell'
import { PHASE_PAIR_GRID } from '../lib/battlePhaseLayout'
import type { ModelResult, ProblemGradingContext, TestCase } from '@/types'

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
  /** 服务端仍在流式写模型输出时，主列 <main> 跟随滚到底 */
  streamBattle?: boolean
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
}: CompareProps) {
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

  /** 仅流式对战粘底；本地重跑官方用例不 force，避免刷新后因 running_tests 整页滚到底 */
  const mainScrollForce = streamBattle

  return (
    <>
      <MainAutoScroll
        battleId={battleId}
        force={mainScrollForce}
        thoughtA={resultA.thought}
        codeA={resultA.code}
        thoughtB={resultB.thought}
        codeB={resultB.code}
        runDoneA={hookA.runProgress?.done}
        runDoneB={hookB.runProgress?.done}
      />
      <div className="flex min-h-0 min-w-0 flex-col gap-4">
        <div className="grid min-h-0 grid-cols-1 gap-2 sm:grid-cols-2 sm:items-center sm:gap-x-6 sm:gap-y-1">
          <ColumnHeader label={modelAName} hook={hookA} />
          <ColumnHeader label={modelBName} hook={hookB} />
        </div>

        <section className="flex min-h-0 min-w-0 flex-col gap-2">
          <PhaseColumnHeading>1 · 分析</PhaseColumnHeading>
          <div className={PHASE_PAIR_GRID}>
            <AnalysisCell battleId={battleId} hook={hookA} />
            <AnalysisCell battleId={battleId} hook={hookB} />
          </div>
        </section>

        {(hookA.showCodePhase || hookB.showCodePhase) && (
          <section className="flex min-h-0 min-w-0 flex-col gap-2">
            <PhaseColumnHeading>2 · 代码</PhaseColumnHeading>
            <div className={PHASE_PAIR_GRID}>
              {hookA.showCodePhase ? (
                <CodeCell battleId={battleId} hook={hookA} />
              ) : (
                <PhasePairedPlaceholder>等待分析完成…</PhasePairedPlaceholder>
              )}
              {hookB.showCodePhase ? (
                <CodeCell battleId={battleId} hook={hookB} />
              ) : (
                <PhasePairedPlaceholder>等待分析完成…</PhasePairedPlaceholder>
              )}
            </div>
          </section>
        )}

        {(hookA.showOfficialPhase || hookB.showOfficialPhase) && (
          <section className="flex min-h-0 min-w-0 flex-col gap-2">
            <PhaseColumnHeading>3 · 执行测试</PhaseColumnHeading>
            <div className={PHASE_PAIR_GRID}>
              {hookA.showOfficialPhase ? (
                <OfficialCell hook={hookA} />
              ) : (
                <PhasePairedPlaceholder>等待代码阶段完成…</PhasePairedPlaceholder>
              )}
              {hookB.showOfficialPhase ? (
                <OfficialCell hook={hookB} />
              ) : (
                <PhasePairedPlaceholder>等待代码阶段完成…</PhasePairedPlaceholder>
              )}
            </div>
          </section>
        )}
      </div>
    </>
  )
}
