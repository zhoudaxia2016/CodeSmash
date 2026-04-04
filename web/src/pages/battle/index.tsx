import { useState, useEffect, useMemo } from 'react'
import { ChevronDown } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useProblem, useStartBattle, useBattle } from '@/hooks/useApi'
import type { PlatformModel, Problem, TestCase } from '@/types'
import { Result } from './result'
import { CopyVerifySnippetButton } from './compare/copy-verify-snippet-button'
import { buildVerifySnippetStub } from '@/lib/copyTestHarness'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export function Battle({ models, problems }: { models: PlatformModel[]; problems: Problem[] }) {
  const queryClient = useQueryClient()
  const [selectedProblem, setSelectedProblem] = useState('')
  const [problemDetailOpen, setProblemDetailOpen] = useState(false)
  const [modelA, setModelA] = useState('')
  const [modelB, setModelB] = useState('')
  const [battleId, setBattleId] = useState<string | null>(null)
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
  /** 仅 API 成功后才用官方用例；失败或无数据时不兜底 mock */
  const battleTestsReady = !!selectedProblem && problemForBattleQuery.isSuccess

  const selectedProblemRow = problems.find((p) => p.id === selectedProblem)
  const officialTestCases: TestCase[] = problemDetail?.testCases ?? []

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

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Select Problem</CardTitle>
        </CardHeader>
        <CardContent className="space-y-0">
          <Select value={selectedProblem} onValueChange={setSelectedProblem}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Choose a problem..." />
            </SelectTrigger>
            <SelectContent>
              {problems.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <button
            type="button"
            onClick={() => setProblemDetailOpen((o) => !o)}
            disabled={!selectedProblemRow}
            className="mt-4 flex w-full items-center justify-between gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-left text-sm font-medium text-foreground transition-colors hover:bg-muted/70 disabled:pointer-events-none disabled:opacity-50"
            aria-expanded={problemDetailOpen}
          >
            <span>题目描述与官方测试用例</span>
            <ChevronDown
              className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${problemDetailOpen ? 'rotate-180' : ''}`}
              aria-hidden
            />
          </button>

          {problemDetailOpen && selectedProblemRow && (
            <div className="mt-3 space-y-4 rounded-lg border border-border bg-card p-4 text-sm">
              <div>
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-foreground">{selectedProblemRow.title}</span>
                  {selectedProblemRow.difficulty && (
                    <span className="rounded-md bg-secondary px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-wide text-secondary-foreground">
                      {selectedProblemRow.difficulty}
                    </span>
                  )}
                  {selectedProblemRow.tags?.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-md border border-border bg-background px-1.5 py-0.5 text-[11px] text-muted-foreground"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
                <p className="whitespace-pre-wrap text-muted-foreground leading-relaxed">
                  {selectedProblemRow.description}
                </p>
              </div>

              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">入口与签名</p>
                <p className="text-xs text-muted-foreground">
                  函数名：<code className="rounded bg-muted px-1 py-0.5 font-mono">{selectedProblemRow.entryPoint}</code>
                </p>
                <pre className="mt-2 overflow-x-auto rounded-md border border-border bg-muted/50 p-3 font-mono text-xs text-foreground">
                  {selectedProblemRow.functionSignature}
                </pre>
              </div>

              <div>
                <p className="mb-2 text-xs font-medium text-muted-foreground">
                  官方测试用例
                  {problemDetailLoading && '（加载中…）'}
                  {problemDetailError && !problemDetail && (
                    <span className="ml-1 font-normal text-amber-600 dark:text-amber-400">
                      （接口不可用，已使用本地示例数据）
                    </span>
                  )}
                </p>
                {problemDetailLoading && officialTestCases.length === 0 ? (
                  <p className="text-muted-foreground">正在加载测试用例…</p>
                ) : officialTestCases.length === 0 ? (
                  <p className="text-muted-foreground">暂无测试用例</p>
                ) : (
                  <div className="overflow-x-auto rounded-md border border-border">
                    <table className="w-full min-w-[32rem] text-left text-xs">
                      <thead className="border-b border-border bg-muted/50 font-medium text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2 w-10">#</th>
                          <th className="px-3 py-2">输入（main 参数）</th>
                          <th className="px-3 py-2">期望输出</th>
                          <th className="px-3 py-2 w-24">来源</th>
                          <th className="px-3 py-2 w-[5.5rem] shrink-0">验证</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {officialTestCases.map((tc, idx) => (
                          <tr key={tc.id} className="bg-background/50">
                            <td className="px-3 py-2 font-mono text-muted-foreground">{idx + 1}</td>
                            <td className="px-3 py-2 font-mono text-foreground">{tc.input}</td>
                            <td className="px-3 py-2 font-mono text-foreground">{tc.expectedOutput}</td>
                            <td className="px-3 py-2 text-muted-foreground">
                              {tc.source === 'generated' ? '生成' : '手工'}
                            </td>
                            <td className="px-3 py-2 align-middle">
                              <CopyVerifySnippetButton
                                text={buildVerifySnippetStub(
                                  tc.input,
                                  tc.expectedOutput,
                                  selectedProblemRow.functionSignature,
                                )}
                                label="复制"
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Select Two Models</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <Select value={modelA} onValueChange={setModelA}>
              <SelectTrigger>
                <SelectValue placeholder="Model A" />
              </SelectTrigger>
              <SelectContent>
                {models.map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={modelB} onValueChange={setModelB}>
              <SelectTrigger>
                <SelectValue placeholder="Model B" />
              </SelectTrigger>
              <SelectContent>
                {models.map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Button
        disabled={!canStart}
        onClick={handleStartBattle}
        className="w-full"
      >
        Start Battle
      </Button>

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
      />
    </div>
  )
}
