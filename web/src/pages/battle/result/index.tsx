import { Compare } from '../compare'
import { buildMockBattle } from '../lib/mockBattle'
import type { BattleSession, ProblemGradingContext, TestCase } from '@/types'

type Props = {
  battle: BattleSession | null | undefined
  battleId: string | null
  battleLoading: boolean
  battleError: boolean
  starting: boolean
  selectedProblemId: string
  modelAName: string
  modelBName: string
  runTestCases: TestCase[]
  battleTestsReady: boolean
  grading: ProblemGradingContext
}

export function Result({
  battle,
  battleId,
  battleLoading,
  battleError,
  starting,
  selectedProblemId,
  modelAName,
  modelBName,
  runTestCases,
  battleTestsReady,
  grading,
}: Props) {
  if (starting && !battleId) {
    return (
      <section className="space-y-4">
        <p className="text-sm text-muted-foreground">正在创建对战…</p>
      </section>
    )
  }

  if (battleLoading) {
    return (
      <section className="space-y-4">
        <p className="text-sm text-muted-foreground">正在拉取对战状态…</p>
      </section>
    )
  }

  if (battleError) {
    return (
      <section className="space-y-4">
        <p className="text-sm text-red-600 dark:text-red-400">对战数据加载失败，请确认 API 可用后重试。</p>
      </section>
    )
  }

  if (battleId != null && battle == null) {
    return (
      <section className="space-y-4">
        <p className="text-sm text-muted-foreground">暂无对战数据。</p>
      </section>
    )
  }

  const effective = battle ?? buildMockBattle(selectedProblemId)
  const fromServerBattle = battle != null
  const battleStatusLabel: Record<string, string> = {
    pending: '排队中',
    running: '模型输出中',
    awaiting_client: '模型输出完成，等待在本地运行测试',
    completed: '已完成',
    failed: '失败',
    partial: '部分完成',
  }
  return (
    <section className="space-y-4">
      {fromServerBattle ? (
        <div className="flex flex-wrap justify-end gap-2">
          <span className="text-xs text-muted-foreground">
            {battleStatusLabel[battle.status] ?? battle.status}
          </span>
        </div>
      ) : (
        <div className="rounded-lg border border-border/80 bg-muted/25 px-3 py-2.5 text-left">
          <p className="text-xs font-medium text-foreground">演示数据（虚构，非模型生成）</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            用于在你点击「开始对战」之前，预览对战结束后的页面结构：双模型并列、分析 → 代码 → 测试的流程与最终结果形态。发起对战后，此处会替换为真实输出。
          </p>
        </div>
      )}
      {effective.modelAResult && effective.modelBResult ? (
        <Compare
          key={`${effective.id}-${effective.problemId}-compare`}
          battleId={effective.id}
          modelAName={modelAName}
          modelBName={modelBName}
          resultA={effective.modelAResult}
          resultB={effective.modelBResult}
          testCases={runTestCases}
          testsReady={battleTestsReady}
          grading={grading}
          submitOfficialToServer={fromServerBattle}
          streamBattle={fromServerBattle && battle?.status === 'running'}
        />
      ) : (
        <div className="grid gap-4 text-sm text-muted-foreground sm:grid-cols-2">
          {!effective.modelAResult && <p>模型 A：等待输出…</p>}
          {!effective.modelBResult && <p>模型 B：等待输出…</p>}
        </div>
      )}
    </section>
  )
}
