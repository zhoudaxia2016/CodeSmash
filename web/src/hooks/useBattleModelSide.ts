import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import type { ModelResult, ProblemGradingContext, TestCase, TestResult } from '@/types'
import { useSandbox } from '@/utils/sandbox'

export function officialMetrics(r: ModelResult) {
  const o = r.officialResult
  if (o) return { passed: o.passed, total: o.total }
  return { passed: 0, total: 0 }
}

export function activityLabel(r: ModelResult): string {
  const statusLabel = (status: ModelResult['status']): string => {
    const map: Record<ModelResult['status'], string> = {
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
  const [localOfficial, setLocalOfficial] = useState<ModelResult['officialResult'] | null>(null)
  const [officialError, setOfficialError] = useState<'run' | 'save' | null>(null)
  const [runFailureDetail, setRunFailureDetail] = useState<string | null>(null)
  const ranRef = useRef(false)

  const displayResult: ModelResult =
    localOfficial != null
      ? { ...result, officialResult: localOfficial, phase: 'completed', status: 'completed' }
      : result

  const { passed, total } = officialMetrics(displayResult)
  const ok = displayResult.status === 'completed' && displayResult.phase === 'completed'
  const failedLlm = result.status === 'failed' || result.phase === 'failed'
  const testCaseCount = testCases.length
  const runningOfficial = localPhase === 'running_tests'
  const showOfficialSection =
    !failedLlm && !runningOfficial && displayResult.officialResult != null

  useEffect(() => {
    if (!battleId || result.officialResult) return
    if (!testsReady) return
    if (result.phase !== 'awaiting_execution') return
    if (failedLlm) return
    if (ranRef.current) return
    ranRef.current = true

    const code = (result.code ?? '').trim()
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
    result.code,
    result.officialResult,
    result.phase,
    result.status,
    runCodeWithProgress,
    submitOfficialToServer,
    testCases,
    testsReady,
    grading,
  ])

  const phase = displayResult.phase ?? 'pending'

  /** 顺序展示：分析结束前不显示代码区与官方用例区 */
  const showCodePhase =
    phase !== 'pending' &&
    phase !== 'analyzing' &&
    !(phase === 'failed' && !String(displayResult.code ?? '').trim())
  /** 代码生成中不显示官方用例；进入待评测/完成/失败（已过代码阶段）后再显示 */
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
    result,
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
