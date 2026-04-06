import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import type {
  ModelResult,
  ModelRound,
  ProblemGradingContext,
  TestCase,
  TestResult,
} from '@/types'
import { currentBattleRound, officialMetrics } from '@/utils/battle-round'
import { useSandbox } from '@/utils/sandbox'

const FALLBACK_ROUND: ModelRound = {
  phase: 'pending',
  status: 'running',
}

export function activityLabel(r: ModelRound): string {
  const statusLabel = (status: ModelRound['status']): string => {
    const map: Record<ModelRound['status'], string> = {
      pending: '排队',
      thinking: '思考中',
      coding: '生成代码中',
      selfTesting: '自测中',
      running: '进行中',
      completed: '已完成',
      failed: '失败',
      error: '出错',
      timeout: '超时',
    }
    return map[status]
  }
  if (r.status === 'failed' || r.status === 'error' || r.status === 'timeout') {
    return statusLabel(r.status)
  }
  if (r.status === 'completed' && r.phase === 'completed') {
    return statusLabel('completed')
  }
  if (r.status === 'running' || r.status === 'pending') {
    if (r.phase === 'analyzing') return '生成分析中'
    if (r.phase === 'coding') return '生成代码中'
    if (r.phase === 'awaiting_execution') return '代码已就绪，将运行测试'
    if (r.phase === 'pending') return '排队'
    if (r.phase === 'failed') return statusLabel('failed')
  }
  return statusLabel(r.status)
}

export type UseBattleModelSideArgs = {
  battleId: string
  side: 'modelA' | 'modelB'
  result: ModelResult
  testCases: TestCase[]
  testsReady: boolean
  grading: ProblemGradingContext
  submitOfficialToServer?: boolean
}

export function useBattleModelSide({
  battleId,
  side,
  result,
  testCases,
  testsReady,
  grading,
  submitOfficialToServer = true,
}: UseBattleModelSideArgs) {
  const queryClient = useQueryClient()
  const { runCodeWithProgress } = useSandbox()
  const [runProgress, setRunProgress] = useState<{ done: number; total: number } | null>(null)
  const [localPhase, setLocalPhase] = useState<'idle' | 'running_tests' | 'done' | 'error'>('idle')
  const [localOfficial, setLocalOfficial] = useState<ModelRound['officialResult'] | null>(null)
  const [officialError, setOfficialError] = useState<'run' | 'save' | null>(null)
  const [runFailureDetail, setRunFailureDetail] = useState<string | null>(null)
  const ranRef = useRef(false)

  const cur = currentBattleRound(result) ?? FALLBACK_ROUND

  useEffect(() => {
    setLocalOfficial(null)
    setLocalPhase('idle')
    setOfficialError(null)
    setRunFailureDetail(null)
    ranRef.current = false
  }, [battleId, result.result.length])

  const displayResult: ModelRound =
    localOfficial != null
      ? { ...cur, officialResult: localOfficial, phase: 'completed', status: 'completed' }
      : cur

  const { passed, total } = officialMetrics(displayResult)
  const ok = displayResult.status === 'completed' && displayResult.phase === 'completed'
  const failedLlm = cur.status === 'failed' || cur.phase === 'failed'
  const testCaseCount = testCases.length
  const runningOfficial = localPhase === 'running_tests'
  const showOfficialSection =
    !failedLlm && !runningOfficial && displayResult.officialResult != null

  useEffect(() => {
    if (!battleId || cur.officialResult) return
    if (!testsReady) return
    if (cur.phase !== 'awaiting_execution') return
    if (failedLlm) return
    if (ranRef.current) return
    ranRef.current = true

    const code = (cur.code ?? '').trim()
    if (!code || testCases.length === 0) {
      const emptyOfficial = {
        passed: 0,
        total: testCases.length,
        timeMs: 0,
        details: [] as TestResult[],
      }
      void (async () => {
        setLocalOfficial(emptyOfficial)
        if (submitOfficialToServer) {
          try {
            await api.submitBattleOfficial(battleId, {
              side,
              officialResult: emptyOfficial,
            })
            await queryClient.invalidateQueries({ queryKey: ['battles', battleId] })
          } catch {
            setOfficialError('save')
          }
        }
        setLocalPhase('done')
      })()
      return
    }

    setLocalPhase('running_tests')
    setRunProgress({ done: 0, total: testCases.length })

    let cancelled = false
    void (async () => {
      let details: TestResult[]
      try {
        details = await runCodeWithProgress(code, testCases, grading, (done, tot) => {
          if (!cancelled) setRunProgress({ done, total: tot })
        })
      } catch (e: unknown) {
        if (!cancelled) {
          setOfficialError('run')
          setRunFailureDetail(e instanceof Error ? e.message : String(e))
          setLocalPhase('error')
        }
        return
      }
      if (cancelled) return
      const officialResult = {
        passed: details.filter((d) => d.passed).length,
        total: details.length,
        timeMs: Math.round(details.reduce((s, d) => s + (d.timeMs ?? 0), 0)),
        details,
      }
      setLocalOfficial(officialResult)
      if (submitOfficialToServer) {
        try {
          await api.submitBattleOfficial(battleId, { side, officialResult })
          await queryClient.invalidateQueries({ queryKey: ['battles', battleId] })
        } catch {
          if (!cancelled) setOfficialError('save')
        }
      }
      if (!cancelled) setLocalPhase('done')
    })()

    return () => {
      cancelled = true
    }
  }, [
    battleId,
    side,
    failedLlm,
    queryClient,
    cur.code,
    cur.officialResult,
    cur.phase,
    cur.status,
    result.result.length,
    runCodeWithProgress,
    submitOfficialToServer,
    testCases,
    testsReady,
    grading,
  ])

  const phase = displayResult.phase ?? 'pending'

  const showCodePhase =
    phase !== 'pending' &&
    phase !== 'analyzing' &&
    !(phase === 'failed' && !String(displayResult.code ?? '').trim())
  const showOfficialPhase = showCodePhase && phase !== 'coding'

  const showAnalysis =
    displayResult.phase === 'analyzing' ||
    displayResult.phase === 'coding' ||
    displayResult.phase === 'awaiting_execution' ||
    displayResult.phase === 'completed' ||
    (displayResult.thought && displayResult.thought.length > 0)
  const showCode =
    displayResult.phase === 'coding' ||
    displayResult.phase === 'awaiting_execution' ||
    displayResult.phase === 'completed' ||
    (displayResult.code && displayResult.code.length > 0)

  return {
    displayResult,
    failedLlm,
    ok,
    passed,
    total,
    runningOfficial,
    showOfficialSection,
    localPhase,
    runProgress,
    officialError,
    runFailureDetail,
    showAnalysis,
    showCode,
    showCodePhase,
    showOfficialPhase,
    testCaseCount,
    testsReady,
    submitOfficialToServer,
    entryPoint: grading.entryPoint,
  }
}
