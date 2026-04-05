import { useState, useEffect, useLayoutEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, X } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useProblem, useStartBattle, useBattle } from '@/hooks/useApi'
import type { PlatformModel, Problem, ProblemGradingContext, TestCase } from '@/types'
import { defaultAuthoringModelId } from '@/lib/authoring-model'
import { Result } from './result'
import { NewProblem } from './new-problem'
import { CodeBlock } from '@/components/code-block'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const HEADER_SLOT_ID = 'battle-header-slot'
const APP_SHELL_HEADER_ID = 'app-shell-header'
const PROBLEM_POPOVER_SLOT_ID = 'battle-problem-popover-slot'

export function Battle({ models, problems }: { models: PlatformModel[]; problems: Problem[] }) {
  const queryClient = useQueryClient()
  const [selectedProblem, setSelectedProblem] = useState('')
  const [problemDetailOpen, setProblemDetailOpen] = useState(false)
  const [modelA, setModelA] = useState('')
  const [modelB, setModelB] = useState('')
  const [battleId, setBattleId] = useState<string | null>(null)
  const [newProblemOpen, setNewProblemOpen] = useState(false)
  const { mutate: startBattle, isPending: battleStarting } = useStartBattle()
  const { data: battle, isLoading: battleLoading, isError: battleError } = useBattle(battleId || '')
  const {
    data: problemDetail,
    isLoading: problemDetailLoading,
    isError: problemDetailError,
  } = useProblem(selectedProblem, { enabled: !!selectedProblem && problemDetailOpen })
  const problemForBattleQuery = useProblem(selectedProblem, {
    enabled: !!selectedProblem,
  })
  const runTestCases = useMemo(() => {
    if (!selectedProblem || !problemForBattleQuery.isSuccess) return []
    return problemForBattleQuery.data?.testCases ?? []
  }, [problemForBattleQuery.isSuccess, problemForBattleQuery.data?.testCases, selectedProblem])
  /** 仅 API 成功后才用题目用例；失败或无数据时不兜底 mock */
  const battleTestsReady = !!selectedProblem && problemForBattleQuery.isSuccess

  const gradingContext = useMemo((): ProblemGradingContext => {
    const p = problemForBattleQuery.data?.problem ?? problems.find((x) => x.id === selectedProblem)
    if (!p) {
      return { entryPoint: 'main', gradingMode: 'expected', verifySource: null }
    }
    return {
      entryPoint: p.entryPoint,
      gradingMode: p.gradingMode ?? 'expected',
      verifySource: p.verifySource ?? null,
    }
  }, [problemForBattleQuery.data?.problem, problems, selectedProblem])

  const selectedProblemRow = problems.find((p) => p.id === selectedProblem)
  const problemDetailTestCases: TestCase[] = problemDetail?.testCases ?? []

  const [headerSlotEl, setHeaderSlotEl] = useState<HTMLElement | null>(null)
  const [problemPopoverSlotEl, setProblemPopoverSlotEl] = useState<HTMLElement | null>(null)
  const [problemPopoverMaxHeightPx, setProblemPopoverMaxHeightPx] = useState<number | null>(null)

  useLayoutEffect(() => {
    setHeaderSlotEl(document.getElementById(HEADER_SLOT_ID))
    setProblemPopoverSlotEl(document.getElementById(PROBLEM_POPOVER_SLOT_ID))
  }, [])

  useLayoutEffect(() => {
    if (!problemDetailOpen) {
      setProblemPopoverMaxHeightPx(null)
      return
    }
    const measure = () => {
      const el = document.getElementById(APP_SHELL_HEADER_ID)
      if (el) {
        const bottom = el.getBoundingClientRect().bottom
        setProblemPopoverMaxHeightPx(Math.max(160, window.innerHeight - bottom - 16))
      }
    }
    measure()
    const headerEl = document.getElementById(APP_SHELL_HEADER_ID)
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null
    if (headerEl && ro) ro.observe(headerEl)
    window.addEventListener('resize', measure)
    return () => {
      ro?.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [problemDetailOpen])

  useEffect(() => {
    if (problems.length > 0 && !selectedProblem) {
      setSelectedProblem(problems[0].id)
    }
  }, [problems, selectedProblem])

  useEffect(() => {
    setProblemDetailOpen(false)
  }, [selectedProblem])

  useEffect(() => {
    if (models.length > 0) {
      if (!modelA) setModelA(models[0].id)
      if (!modelB) setModelB(models[1]?.id || models[0].id)
    }
  }, [models, modelA, modelB])

  useEffect(() => {
    if (!problemDetailOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setProblemDetailOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [problemDetailOpen])

  const canStart = selectedProblem && modelA && modelB
  const modelAName = models.find((m) => m.id === modelA)?.name || 'Model A'
  const modelBName = models.find((m) => m.id === modelB)?.name || 'Model B'

  const handleStartBattle = () => {
    if (!canStart) return
    if (battleId) {
      queryClient.removeQueries({ queryKey: ['battles', battleId] })
    }
    setBattleId(null)
    startBattle(
      { problemId: selectedProblem, modelAId: modelA, modelBId: modelB },
      {
        onSuccess: (battleSession) => {
          setBattleId(battleSession.id)
        },
      },
    )
  }

  const headerControls = (
    <div className="flex w-full min-w-0 flex-wrap items-center gap-2">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
      <Select value={selectedProblem} onValueChange={setSelectedProblem}>
        <SelectTrigger
          className="h-9 min-w-[10rem] max-w-[20rem] flex-1 sm:flex-none sm:max-w-[18rem]"
          aria-label="选择题目"
        >
          <SelectValue placeholder="题目…" />
        </SelectTrigger>
        <SelectContent>
          {problems.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.title}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={modelA} onValueChange={setModelA}>
        <SelectTrigger
          className="h-9 w-full min-w-[8rem] sm:w-[11rem]"
          aria-label="模型 A"
        >
          <SelectValue placeholder="Model A" />
        </SelectTrigger>
        <SelectContent>
          {models.map((m) => (
            <SelectItem key={m.id} value={m.id}>
              {m.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={modelB} onValueChange={setModelB}>
        <SelectTrigger
          className="h-9 w-full min-w-[8rem] sm:w-[11rem]"
          aria-label="模型 B"
        >
          <SelectValue placeholder="Model B" />
        </SelectTrigger>
        <SelectContent>
          {models.map((m) => (
            <SelectItem key={m.id} value={m.id}>
              {m.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="shrink-0 gap-1.5"
        disabled={!selectedProblemRow}
        aria-expanded={problemDetailOpen}
        onClick={() => setProblemDetailOpen((o) => !o)}
      >
        题目与用例
        <ChevronDown
          className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${problemDetailOpen ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </Button>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="shrink-0"
        disabled={models.length === 0}
        title={models.length === 0 ? '需至少一个可用模型以使用命题辅助' : undefined}
        onClick={() => setNewProblemOpen(true)}
      >
        新建题目
      </Button>
      </div>
      <Button
        type="button"
        disabled={!canStart || battleStarting}
        onClick={handleStartBattle}
        className="h-9 shrink-0"
      >
        {battleStarting ? '创建中…' : '开始对战'}
      </Button>
    </div>
  )

  return (
    <div className="space-y-6">
      {headerSlotEl ? createPortal(headerControls, headerSlotEl) : null}

      <Result
        battle={battle}
        battleId={battleId}
        battleLoading={!!battleId && battleLoading}
        battleError={!!battleId && battleError}
        starting={battleStarting}
        selectedProblemId={selectedProblem}
        modelAName={modelAName}
        modelBName={modelBName}
        runTestCases={runTestCases}
        battleTestsReady={battleTestsReady}
        grading={gradingContext}
      />

      <NewProblem
        open={newProblemOpen}
        onOpenChange={setNewProblemOpen}
        models={models}
        defaultModelId={defaultAuthoringModelId(models)}
        onCreated={(id) => {
          setSelectedProblem(id)
          void queryClient.invalidateQueries({ queryKey: ['problems'] })
          void queryClient.invalidateQueries({ queryKey: ['problems', id] })
        }}
      />

      {problemDetailOpen &&
        selectedProblemRow &&
        problemPopoverSlotEl &&
        createPortal(
          <div className="pointer-events-auto absolute inset-x-0 top-0">
            <div className="mx-auto w-full max-w-7xl px-6 sm:px-8 lg:px-10">
              <div
                role="dialog"
                aria-modal="false"
                aria-labelledby="battle-problem-popover-title"
                className="overflow-y-auto rounded-b-lg border border-t-0 border-border bg-card p-4 text-sm shadow-md supports-[backdrop-filter]:bg-card"
                style={{
                  maxHeight:
                    problemPopoverMaxHeightPx != null
                      ? `${problemPopoverMaxHeightPx}px`
                      : 'min(85vh, 70dvh)',
                }}
              >
                <div className="mb-3 flex items-start justify-between gap-3">
                  <h2
                    id="battle-problem-popover-title"
                    className="text-sm font-semibold leading-tight text-foreground"
                  >
                    题目与测试用例
                  </h2>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    onClick={() => setProblemDetailOpen(false)}
                    aria-label="关闭"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <div>
                  <div>
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-foreground">{selectedProblemRow.title}</span>
                      {selectedProblemRow.tags?.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-md border border-border bg-background px-1.5 py-0.5 text-[11px] text-muted-foreground"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                    <p className="whitespace-pre-wrap leading-relaxed text-muted-foreground">
                      {selectedProblemRow.description}
                    </p>
                  </div>

                  <div className="mt-6">
                    <p className="mb-1 text-xs font-medium text-muted-foreground">入口与签名</p>
                    <p className="text-xs text-muted-foreground">
                      判题：
                      <span className="ml-1 font-mono text-foreground">
                        {selectedProblemRow.gradingMode === 'verify' ? '自定义 verify' : '标准答案'}
                      </span>
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      入口{' '}
                      <code className="rounded bg-muted px-1 py-0.5 font-mono">
                        {selectedProblemRow.entryPoint}
                      </code>
                    </p>
                    <CodeBlock
                      code={selectedProblemRow.functionSignature}
                      className="m-0 mt-2 overflow-x-auto rounded-md border border-border bg-muted/50 p-3 font-mono text-xs leading-relaxed text-foreground whitespace-pre"
                    />
                    {problemDetail?.problem?.gradingMode === 'verify' &&
                      problemDetail.problem.verifySource?.trim() && (
                        <div className="mt-3">
                          <p className="mb-1 text-xs font-medium text-muted-foreground">verify 源码</p>
                          <CodeBlock
                            code={problemDetail.problem.verifySource.trim()}
                            className="m-0 overflow-x-auto rounded-md border border-border bg-muted/50 p-3 font-mono text-xs leading-relaxed text-foreground whitespace-pre"
                          />
                        </div>
                      )}
                  </div>

                  <div className="mt-6">
                    <p className="mb-2 text-xs font-medium text-muted-foreground">
                      测试用例
                      {problemDetailLoading && '（加载中…）'}
                      {problemDetailError && !problemDetail && (
                        <span className="ml-1 font-normal text-amber-600 dark:text-amber-400">
                          （接口不可用，已使用本地示例数据）
                        </span>
                      )}
                    </p>
                    {problemDetailLoading && problemDetailTestCases.length === 0 ? (
                      <p className="text-muted-foreground">正在加载测试用例…</p>
                    ) : problemDetailTestCases.length === 0 ? (
                      <p className="text-muted-foreground">暂无测试用例</p>
                    ) : (
                      <div className="overflow-x-auto rounded-md border border-border">
                        <table className="w-full min-w-[18rem] text-left text-xs">
                          <thead className="border-b border-border bg-muted/50 font-medium text-muted-foreground">
                            <tr>
                              <th className="w-10 px-3 py-2">#</th>
                              <th className="px-3 py-2">参数 data（JSON）</th>
                              <th className="px-3 py-2">期望 / 判题</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {problemDetailTestCases.map((tc, idx) => (
                              <tr key={tc.id} className="bg-background/50">
                                <td className="px-3 py-2 font-mono text-muted-foreground">{idx + 1}</td>
                                <td className="px-3 py-2 font-mono text-foreground">{tc.input}</td>
                                <td className="px-3 py-2 font-mono text-foreground">{tc.expectedOutput}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>,
          problemPopoverSlotEl,
        )}
    </div>
  )
}
