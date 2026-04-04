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
import type { ModelResult, TestCase } from '@/types'

export type CompareProps = {
  battleId: string
  modelAName: string
  modelBName: string
  resultA: ModelResult
  resultB: ModelResult
  testCases: TestCase[]
  testsReady: boolean
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
  submitOfficialToServer = true,
  streamBattle = false,
}: CompareProps) {
  const hookA = useBattleModelSide({
    battleId,
    side: 'modelA',
    result: resultA,
    testCases,
    testsReady,
    submitOfficialToServer,
  })
  const hookB = useBattleModelSide({
    battleId,
    side: 'modelB',
    result: resultB,
    testCases,
    testsReady,
    submitOfficialToServer,
  })

  const mainScrollForce =
    streamBattle || hookA.runningOfficial || hookB.runningOfficial

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
      <div className="flex min-h-0 min-w-0 flex-col gap-8">
        <div className="grid min-h-0 grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-8">
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
