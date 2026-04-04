import { useState, useEffect } from 'react'
import { useModels, useProblems, useStartBattle, useBattle } from './hooks/useApi'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

type ModelResult = {
  status: 'completed' | 'failed'
  thought: string
  code: string
  selfTestCases: { input: string; expectedOutput: string }[]
  selfTestConclusion: string
  officialPassed: number
  officialTotal: number
  officialTimeMs: number
  timeMs: number
  error?: string
}

const MOCK_BATTLE_RESULT = {
  modelAResult: {
    status: 'completed' as const,
    thought: 'Use two-pointer approach. Start from both ends and move towards center.',
    code: 'function twoSum(nums, target) {\n  let left = 0, right = nums.length - 1;\n  while (left < right) {\n    const sum = nums[left] + nums[right];\n    if (sum === target) return [left, right];\n    sum < target ? left++ : right--;\n  }\n  return [];\n}',
    selfTestCases: [
      { input: '[2,7,11,15], 9', expectedOutput: '[0,1]' },
      { input: '[3,2,4], 6', expectedOutput: '[1,2]' },
    ],
    selfTestConclusion: '自测通过',
    officialPassed: 8,
    officialTotal: 10,
    officialTimeMs: 45,
    timeMs: 120,
  } as ModelResult,
  modelBResult: {
    status: 'completed' as const,
    thought: 'Hash map approach. Store complement for each element.',
    code: 'function twoSum(nums, target) {\n  const map = new Map();\n  for (let i = 0; i < nums.length; i++) {\n    const complement = target - nums[i];\n    if (map.has(complement)) return [map.get(complement), i];\n    map.set(nums[i], i);\n  }\n  return [];\n}',
    selfTestCases: [
      { input: '[2,7,11,15], 9', expectedOutput: '[0,1]' },
      { input: '[3,2,4], 6', expectedOutput: '[1,2]' },
    ],
    selfTestConclusion: '自测通过',
    officialPassed: 10,
    officialTotal: 10,
    officialTimeMs: 38,
    timeMs: 95,
  } as ModelResult,
}

function App() {
  const { data: models = [] } = useModels()
  const { data: problems = [] } = useProblems()
  const [view, setView] = useState<'battle' | 'problems' | 'leaderboard'>('battle')

  return (
    <div className="min-h-screen flex bg-background">
      <aside className="w-64 shrink-0 border-r border-arena-sidebar-border bg-arena-sidebar p-4 flex flex-col">
        <div className="flex items-center gap-2.5 mb-8 px-2">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-sm ring-1 ring-white/10">
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
                view === 'battle' ? 'bg-arena-accent shadow-[0_0_8px_hsl(var(--arena-accent)/0.55)]' : 'bg-muted-foreground/40'
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

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-10 border-b border-border/80 bg-arena-header-blur/85 backdrop-blur-md supports-[backdrop-filter]:bg-background/75">
          <div className="w-full max-w-none px-6 sm:px-8 lg:px-12 xl:px-16 py-4">
            <h1 className="text-xl font-semibold text-foreground tracking-tight">
              {view === 'battle' && 'Battle'}
              {view === 'problems' && 'Problems'}
              {view === 'leaderboard' && 'Leaderboard'}
            </h1>
          </div>
        </header>

        <main className="w-full max-w-none px-6 sm:px-8 lg:px-12 xl:px-16 py-8 flex-1">
          {view === 'battle' && <BattleView models={models} problems={problems} />}
          {view === 'problems' && <ProblemsView />}
          {view === 'leaderboard' && <LeaderboardView />}
        </main>
      </div>
    </div>
  )
}

function BattleView({ models, problems }: { models: any[]; problems: any[] }) {
  const [selectedProblem, setSelectedProblem] = useState('')
  const [modelA, setModelA] = useState('')
  const [modelB, setModelB] = useState('')
  const [battleId, setBattleId] = useState<string | null>(null)
  const { mutate: startBattle } = useStartBattle()
  const { data: battle } = useBattle(battleId || '')

  useEffect(() => {
    if (problems.length > 0 && !selectedProblem) {
      setSelectedProblem(problems[0].id)
    }
  }, [problems, selectedProblem])

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
    startBattle(
      { problemId: selectedProblem, modelAId: modelA, modelBId: modelB },
      {
        onSuccess: (data: any) => {
          setBattleId(data.battle.id)
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
        <CardContent>
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

      <BattleResult session={battle} modelAName={modelAName} modelBName={modelBName} />
    </div>
  )
}

function BattleResult({ session, modelAName, modelBName }: { session: any; modelAName: string; modelBName: string }) {
  const result = session ?? MOCK_BATTLE_RESULT
  return (
    <Card>
      <CardHeader>
        <CardTitle>Battle Result</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          {result.modelAResult && <ModelResultCard result={result.modelAResult} label={modelAName} />}
          {result.modelBResult && <ModelResultCard result={result.modelBResult} label={modelBName} />}
        </div>
      </CardContent>
    </Card>
  )
}

function ModelResultCard({ result, label }: { result: ModelResult; label: string }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="font-semibold text-foreground">{label}</span>
        <span className={`text-xs px-1.5 py-0.5 rounded ${result.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
          {result.status}
        </span>
      </div>
      <div className="flex gap-6 text-sm">
        <div>
          <span className="text-muted-foreground">Pass Rate</span>
          <span className="ml-2 font-medium">{result.officialPassed}/{result.officialTotal}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Time</span>
          <span className="ml-2 font-medium">{result.timeMs}ms</span>
        </div>
      </div>
      {result.thought && (
        <div className="p-3 bg-muted rounded-lg border">
          <p className="text-xs text-muted-foreground mb-1">Solution</p>
          <p className="text-sm whitespace-pre-wrap">{result.thought}</p>
        </div>
      )}
      {result.code && (
        <div className="p-3 rounded-lg border border-border bg-arena-code">
          <p className="text-xs text-muted-foreground mb-1.5 font-medium">Generated Code</p>
          <pre className="text-sm text-arena-code-fg overflow-x-auto font-mono leading-relaxed">
            {result.code}
          </pre>
        </div>
      )}
    </div>
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
