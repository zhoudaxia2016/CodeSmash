import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Button } from '@/components/ui/button'
import { api } from '@/api/client'
import { useProblem } from '@/hooks/useApi'
import type { AuthUser, BattleSession, PlatformModel } from '@/types'
import { getLocalBattleEntry } from '@/utils/battle-local-history'
import { Result } from './result'

type Props = {
  battleId: string
  onClose: () => void
  models: PlatformModel[]
  currentUser: AuthUser | null
}

/** 本地或未恢复进服务端内存时的对战详情（只读，不可追问）。 */
export function BattleReadonlyDetail({ battleId, onClose, models, currentUser }: Props) {
  const [battle, setBattle] = useState<BattleSession | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setErr(null)
    const local = getLocalBattleEntry(battleId)
    if (local) {
      setBattle(local.battle)
      setLoading(false)
      return
    }
    void (async () => {
      try {
        const { battle: b } = await api.getBattleResult(battleId)
        if (!cancelled) setBattle(b)
      } catch (e) {
        if (!cancelled) {
          setErr(e instanceof Error ? e.message : '加载失败')
          setBattle(null)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [battleId])

  const problemId = battle?.problemId ?? ''
  const problemQ = useProblem(problemId, { enabled: !!battle && !!problemId })

  const modelName = (id: string) => models.find((m) => m.id === id)?.name ?? id
  const problemDetail = problemQ.data?.problem

  const grading = problemDetail
    ? {
        entryPoint: problemDetail.entryPoint,
        gradingMode: problemDetail.gradingMode ?? 'expected',
        verifySource: problemDetail.verifySource ?? null,
      }
    : { entryPoint: 'main', gradingMode: 'expected' as const, verifySource: null }

  const runTestCases = problemQ.data?.testCases ?? []
  const testsReady = problemQ.isSuccess

  return (
    <section className="space-y-4 rounded-lg border border-border bg-card/40 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-medium text-foreground">对战详情</p>
          <p className="text-xs text-muted-foreground">
            此为只读查看。若该对战已保存在你的云端账户，登录后从对战历史打开可继续追问。
          </p>
          {problemDetail ? (
            <p className="truncate text-xs text-muted-foreground">题目：{problemDetail.title}</p>
          ) : null}
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onClose}>
          关闭
        </Button>
      </div>

      {loading ? <p className="text-sm text-muted-foreground">加载对战数据…</p> : null}
      {err ? (
        <p className="text-sm text-destructive" role="alert">
          {err}
        </p>
      ) : null}

      {!loading && !err && battle ? (
        <>
          {problemDetail ? (
            <details className="rounded-md border border-border/80 bg-muted/20 px-3 py-2">
              <summary className="cursor-pointer text-sm font-medium text-foreground">
                题目摘要（只读）
              </summary>
              <div className="prose prose-sm dark:prose-invert mt-2 max-w-none text-muted-foreground">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{problemDetail.description}</ReactMarkdown>
              </div>
              <p className="mt-2 font-mono text-xs text-foreground/90">
                {problemDetail.functionSignature}
              </p>
            </details>
          ) : problemQ.isError ? (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              题目详情不可用（可能已删除）；仍可查看模型输出。
            </p>
          ) : null}

          <Result
            battle={battle}
            battleId={battle.id}
            battleLoading={false}
            battleError={false}
            starting={false}
            selectedProblemId={battle.problemId}
            modelAName={modelName(battle.modelAId)}
            modelBName={modelName(battle.modelBId)}
            runTestCases={runTestCases}
            battleTestsReady={testsReady}
            grading={grading}
            currentUser={currentUser}
            archiveMode
          />
        </>
      ) : null}
    </section>
  )
}
