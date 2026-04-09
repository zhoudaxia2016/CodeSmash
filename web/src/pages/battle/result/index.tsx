import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { useSyncBattleToCloud } from '@/hooks/useApi'
import type { AuthUser, BattleSession, ProblemGradingContext, TestCase } from '@/types'
import { getLocalBattleEntry, removeLocalBattleEntry } from '@/utils/battle-local-history'
import { Compare } from '../compare'
import { buildMockBattle } from '../lib/mockBattle'

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
  currentUser: AuthUser | null
  /** 终局后的落盘方式（由 Battle 在保存完成后写入）。 */
  terminalPersist?: 'local' | 'cloud' | 'cloud_error' | null
  /** 只读历史详情：不提交官方结果/追问。 */
  archiveMode?: boolean
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
  currentUser,
  terminalPersist = null,
  archiveMode = false,
}: Props) {
  const syncMutation = useSyncBattleToCloud()
  const [syncErr, setSyncErr] = useState<string | null>(null)
  const [cloudSynced, setCloudSynced] = useState(false)

  useEffect(() => {
    setCloudSynced(false)
    setSyncErr(null)
  }, [battleId])

  const terminal =
    battle != null && (battle.status === 'completed' || battle.status === 'failed')
  const localEntry = !archiveMode && battle && terminal ? getLocalBattleEntry(battle.id) : null
  const alreadyOnCloud = cloudSynced
  const canSyncToCloud =
    !archiveMode &&
    !!currentUser &&
    !!battle &&
    terminal &&
    localEntry != null &&
    !alreadyOnCloud

  const handleSync = () => {
    if (!battle || !currentUser) return
    setSyncErr(null)
    syncMutation.mutate(battle, {
      onSuccess: () => {
        removeLocalBattleEntry(battle.id)
        setCloudSynced(true)
      },
      onError: (e) => {
        setSyncErr(e instanceof Error ? e.message : '同步失败')
      },
    })
  }
  if (!archiveMode && starting && !battleId) {
    return (
      <section className="space-y-4">
        <p className="text-sm text-muted-foreground">正在创建对战…</p>
      </section>
    )
  }

  if (!archiveMode && battleLoading) {
    return (
      <section className="space-y-4">
        <p className="text-sm text-muted-foreground">正在拉取对战状态…</p>
      </section>
    )
  }

  if (!archiveMode && battleError) {
    return (
      <section className="space-y-4">
        <p className="text-sm text-red-600 dark:text-red-400">对战数据加载失败，请确认 API 可用后重试。</p>
      </section>
    )
  }

  if (!archiveMode && battleId != null && battle == null) {
    return (
      <section className="space-y-4">
        <p className="text-sm text-muted-foreground">暂无对战数据。</p>
      </section>
    )
  }

  if (archiveMode && !battle) {
    return (
      <section className="space-y-4">
        <p className="text-sm text-muted-foreground">没有可用的对战详情。</p>
      </section>
    )
  }

  const effective = battle ?? buildMockBattle(selectedProblemId)
  const fromServerBattle = battle != null
  const submitOfficialToServer = fromServerBattle && !archiveMode
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
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {archiveMode ? (
              <span className="text-xs text-muted-foreground">历史详情（只读）</span>
            ) : null}
            {!archiveMode && terminal && (
              <span className="text-xs text-muted-foreground">
                {terminalPersist === 'cloud'
                  ? '对战结果已保存到云端'
                  : terminalPersist === 'local'
                    ? '对战结果已保存在本地'
                    : terminalPersist === 'cloud_error'
                      ? '云端保存失败，可稍后在 对战历史 中重试'
                      : '对战已结束，正在保存…'}
                {currentUser && alreadyOnCloud && terminalPersist === 'local' ? ' · 已同步到云端' : ''}
              </span>
            )}
            {canSyncToCloud && (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="h-8"
                  disabled={syncMutation.isPending}
                  onClick={() => handleSync()}
                >
                  {syncMutation.isPending ? '同步中…' : '同步到云端'}
                </Button>
                {syncErr ? (
                  <span className="text-xs text-destructive" role="alert">
                    {syncErr}
                  </span>
                ) : null}
              </>
            )}
          </div>
          <span className="text-xs text-muted-foreground">
            {battleStatusLabel[battle!.status] ?? battle!.status}
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
          submitOfficialToServer={submitOfficialToServer}
          streamBattle={submitOfficialToServer && battle?.status === 'running'}
          battleStatus={fromServerBattle && battle ? battle.status : 'completed'}
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
