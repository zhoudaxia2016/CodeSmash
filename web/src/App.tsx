import { useState, useEffect, useMemo } from 'react'
import { ChevronDown } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useModels, useProblems, useProblem, useStartBattle, useBattle } from './hooks/useApi'
import type { BattleSession, Problem, TestCase } from '@/types'
import { BattleCompare } from '@/components/BattleCompare'
import { CopyVerifySnippetButton } from '@/components/CopyVerifySnippetButton'
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

const MOCK_SOLUTION_MARKDOWN_A = [
  '## 思路',
  '',
  '使用 **双指针**：数组已按非递减排序时，从**最左（最小）**与**最右（最大）**同时向中间收拢，可在 **O(n)** 内找到两数之和。',
  '',
  '### 步骤',
  '',
  '1. 令 `left = 0`，`right = nums.length - 1`。',
  '2. 记 `sum = nums[left] + nums[right]`：',
  '   - 若 `sum === target`，返回 `[left, right]`；',
  '   - 若 `sum < target`，需要和更大 → `left++`；',
  '   - 否则 `right--`。',
  '3. 若指针交错仍无解，返回 `[]`。',
  '',
  '### 复杂度',
  '',
  '| 项目 | 复杂度 |',
  '| --- | --- |',
  '| 时间 | **O(n)** |',
  '| 额外空间 | **O(1)** |',
  '',
  '核心循环：',
  '',
  '```javascript',
  'while (left < right) {',
  '  const sum = nums[left] + nums[right];',
  '  if (sum === target) return [left, right];',
  '  sum < target ? left++ : right--;',
  '}',
  '```',
].join('\n')

const MOCK_SOLUTION_MARKDOWN_B = [
  '## 思路',
  '',
  '使用 **哈希表**（`Map`）在一次扫描中记录「值 → 下标」，对每个元素查找 **补数** `target - nums[i]` 是否已出现。',
  '',
  '### 步骤',
  '',
  '1. 创建空 `Map`。',
  '2. 遍历下标 `i`：',
  '   - `need = target - nums[i]`；',
  '   - 若 `map.has(need)`，返回 `[map.get(need), i]`；',
  '   - 否则 `map.set(nums[i], i)`。',
  '3. 遍历结束无解则返回 `[]`。',
  '',
  '### 复杂度',
  '',
  '| 项目 | 复杂度 |',
  '| --- | --- |',
  '| 时间 | **O(n)** |',
  '| 额外空间 | **O(n)**（哈希表） |',
  '',
  '典型写法：',
  '',
  '```javascript',
  'const map = new Map();',
  'for (let i = 0; i < nums.length; i++) {',
  '  const need = target - nums[i];',
  '  if (map.has(need)) return [map.get(need), i];',
  '  map.set(nums[i], i);',
  '}',
  '```',
].join('\n')

/** 未开战时的示例对战：结构与线上一致，官方用例在本机实跑，不写死结果。 */
function buildMockBattle(problemId: string): BattleSession {
  return {
    id: 'mock-battle',
    problemId: problemId || '1',
    modelAId: '',
    modelBId: '',
    status: 'awaiting_client',
    createdAt: '',
    completedAt: '',
    modelAResult: {
      modelId: 'mock-a',
      status: 'running',
      phase: 'awaiting_execution',
      thought: MOCK_SOLUTION_MARKDOWN_A,
      code: 'function main(nums, target) {\n  let left = 0, right = nums.length - 1;\n  while (left < right) {\n    const sum = nums[left] + nums[right];\n    if (sum === target) return [left, right];\n    sum < target ? left++ : right--;\n  }\n  return [];\n}',
      selfTestCases: [
        { input: '[2,7,11,15], 9', expectedOutput: '[0,1]' },
        { input: '[3,2,4], 6', expectedOutput: '[1,2]' },
      ],
      selfTestConclusion: '自测通过',
      analysisTimeMs: 72,
      codingTimeMs: 48,
      timeMs: 120,
    },
    modelBResult: {
      modelId: 'mock-b',
      status: 'running',
      phase: 'awaiting_execution',
      thought: MOCK_SOLUTION_MARKDOWN_B,
      code: 'function main(nums, target) {\n  const map = new Map();\n  for (let i = 0; i < nums.length; i++) {\n    const complement = target - nums[i];\n    if (map.has(complement)) return [map.get(complement), i];\n    map.set(nums[i], i);\n  }\n  return [];\n}',
      selfTestCases: [
        { input: '[2,7,11,15], 9', expectedOutput: '[0,1]' },
        { input: '[3,2,4], 6', expectedOutput: '[1,2]' },
      ],
      selfTestConclusion: '自测通过',
      analysisTimeMs: 55,
      codingTimeMs: 40,
      timeMs: 95,
    },
  }
}

function App() {
  const { data: models = [] } = useModels()
  const { data: problems = [] } = useProblems()
  const [view, setView] = useState<'battle' | 'problems' | 'leaderboard'>('battle')

  return (
    <div className="flex h-full min-h-0 overflow-hidden bg-background">
      <aside className="flex w-64 shrink-0 flex-col overflow-y-auto border-r border-arena-sidebar-border bg-arena-sidebar p-4">
        <div className="flex items-center gap-2.5 mb-8 px-2">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center ring-1 ring-white/10">
            <span className="text-white font-bold text-sm tracking-tight">CS</span>
          </div>
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="font-semibold text-foreground tracking-tight truncate">CodeSmesh</span>
            <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">
              Arena
            </span>
          </div>
        </div>
        <nav className="flex flex-col gap-0.5" aria-label="Main">
          <button
            type="button"
            onClick={() => setView('battle')}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left ${
              view === 'battle'
                ? 'bg-arena-sidebar-active text-arena-sidebar-active-fg shadow-arena'
                : 'text-arena-sidebar-foreground hover:bg-arena-sidebar-active/60 hover:text-foreground'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
                view === 'battle' ? 'bg-arena-accent shadow-[0_0_6px_hsl(var(--arena-accent)/0.35)]' : 'bg-muted-foreground/40'
              }`}
            />
            Battle
          </button>
          <button
            type="button"
            onClick={() => setView('problems')}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left ${
              view === 'problems'
                ? 'bg-arena-sidebar-active text-arena-sidebar-active-fg shadow-arena'
                : 'text-arena-sidebar-foreground hover:bg-arena-sidebar-active/60 hover:text-foreground'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
                view === 'problems' ? 'bg-emerald-400/90' : 'bg-muted-foreground/40'
              }`}
            />
            Problems
          </button>
          <button
            type="button"
            onClick={() => setView('leaderboard')}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left ${
              view === 'leaderboard'
                ? 'bg-arena-sidebar-active text-arena-sidebar-active-fg shadow-arena'
                : 'text-arena-sidebar-foreground hover:bg-arena-sidebar-active/60 hover:text-foreground'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
                view === 'leaderboard' ? 'bg-violet-400/90' : 'bg-muted-foreground/40'
              }`}
            />
            Leaderboard
          </button>
        </nav>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="z-10 shrink-0 border-b border-border/80 bg-arena-header-blur/85 backdrop-blur-md supports-[backdrop-filter]:bg-background/75">
          <div className="mx-auto w-full max-w-7xl px-6 py-4 sm:px-8 lg:px-10">
            <h1 className="text-xl font-semibold text-foreground tracking-tight">
              {view === 'battle' && 'Battle'}
              {view === 'problems' && 'Problems'}
              {view === 'leaderboard' && 'Leaderboard'}
            </h1>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-7xl px-6 py-8 sm:px-8 lg:px-10">
            {view === 'battle' && <BattleView models={models} problems={problems} />}
            {view === 'problems' && <ProblemsView />}
            {view === 'leaderboard' && <LeaderboardView />}
          </div>
        </main>
      </div>
    </div>
  )
}

function BattleView({ models, problems }: { models: any[]; problems: Problem[] }) {
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
      }
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

      <BattleResult
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

function BattleResult({
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
}: {
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
}) {
  if (starting && !battleId) {
    return (
      <section className="space-y-4 border-t border-border pt-6">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">Battle result</h2>
        <p className="text-sm text-muted-foreground">正在创建对战…</p>
      </section>
    )
  }

  if (battleLoading) {
    return (
      <section className="space-y-4 border-t border-border pt-6">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">Battle result</h2>
        <p className="text-sm text-muted-foreground">正在拉取对战状态…</p>
      </section>
    )
  }

  if (battleError) {
    return (
      <section className="space-y-4 border-t border-border pt-6">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">Battle result</h2>
        <p className="text-sm text-red-600 dark:text-red-400">对战数据加载失败，请确认 API 可用后重试。</p>
      </section>
    )
  }

  if (battleId != null && battle == null) {
    return (
      <section className="space-y-4 border-t border-border pt-6">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">Battle result</h2>
        <p className="text-sm text-muted-foreground">暂无对战数据。</p>
      </section>
    )
  }

  const effective = battle ?? buildMockBattle(selectedProblemId)
  const fromServerBattle = battle != null
  const battleStatusLabel: Record<string, string> = {
    pending: '排队中',
    running: '模型输出中',
    awaiting_client: '等待本机跑官方用例',
    completed: '已完成',
    failed: '失败',
    partial: '部分完成',
  }
  return (
    <section className="space-y-4 border-t border-border pt-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">Battle result</h2>
        <span className="text-xs text-muted-foreground">
          {fromServerBattle
            ? battleStatusLabel[battle.status] ?? battle.status
            : `示例对战 · ${battleStatusLabel[effective.status] ?? effective.status}`}
        </span>
      </div>
      {effective.modelAResult && effective.modelBResult ? (
        <BattleCompare
          key={`${effective.id}-${effective.problemId}-compare`}
          battleId={effective.id}
          modelAName={modelAName}
          modelBName={modelBName}
          resultA={effective.modelAResult}
          resultB={effective.modelBResult}
          testCases={runTestCases}
          testsReady={battleTestsReady}
          submitOfficialToServer={fromServerBattle}
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

function ProblemsView() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Problems</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground">Coming soon...</p>
      </CardContent>
    </Card>
  )
}

function LeaderboardView() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Leaderboard</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground">Coming soon...</p>
      </CardContent>
    </Card>
  )
}

export default App
