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

function App() {
  const { data: models = [] } = useModels()
  const { data: problems = [] } = useProblems()
  const [view, setView] = useState<'battle' | 'problems' | 'leaderboard'>('battle')

  return (
    <div className="min-h-screen flex" style={{ backgroundColor: '#fcfaf8' }}>
      <aside className="w-64 border-r border-border p-4 flex flex-col">
        <div className="flex items-center gap-2 mb-8 px-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
            <span className="text-white font-bold text-sm">CS</span>
          </div>
          <span className="font-semibold text-gray-900">CodeSmash</span>
        </div>
        <nav className="flex flex-col gap-1">
          <button
            onClick={() => setView('battle')}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              view === 'battle'
                ? 'bg-gray-100 text-gray-900'
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-blue-500" />
            Battle
          </button>
          <button
            onClick={() => setView('problems')}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              view === 'problems'
                ? 'bg-gray-100 text-gray-900'
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-green-500" />
            Problems
          </button>
          <button
            onClick={() => setView('leaderboard')}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              view === 'leaderboard'
                ? 'bg-gray-100 text-gray-900'
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-purple-500" />
            Leaderboard
          </button>
        </nav>
      </aside>

      <div className="flex-1">
        <header className="border-b border-border">
          <div className="max-w-5xl mx-auto px-8 py-4">
            <h1 className="text-xl font-semibold text-gray-900">
              {view === 'battle' && 'Battle'}
              {view === 'problems' && 'Problems'}
              {view === 'leaderboard' && 'Leaderboard'}
            </h1>
          </div>
        </header>

        <main className="max-w-5xl mx-auto px-8 py-6">
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

      {battle && <BattleResult session={battle} modelAName={modelAName} modelBName={modelBName} />}
    </div>
  )
}

function BattleResult({ session, modelAName, modelBName }: { session: any; modelAName: string; modelBName: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Battle Result</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          {session.modelAResult && <ModelResultCard result={session.modelAResult} label={modelAName} />}
          {session.modelBResult && <ModelResultCard result={session.modelBResult} label={modelBName} />}
        </div>
      </CardContent>
    </Card>
  )
}

function ModelResultCard({ result, label }: { result: any; label: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Status</span>
            <span className="font-medium">{result.status}</span>
          </div>
          {result.officialResult && (
            <>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Pass Rate</span>
                <span className="font-medium">{result.officialResult.passed}/{result.officialResult.total}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Time</span>
                <span className="font-medium">{result.timeMs}ms</span>
              </div>
            </>
          )}
        </div>
        {result.thought && (
          <div className="mt-4 p-3 bg-muted rounded-lg border">
            <p className="text-xs text-muted-foreground mb-1">Solution</p>
            <p className="text-sm whitespace-pre-wrap">{result.thought}</p>
          </div>
        )}
        {result.code && (
          <div className="mt-4 p-3 bg-black rounded-lg">
            <p className="text-xs text-gray-400 mb-1">Generated Code</p>
            <pre className="text-sm text-green-400 overflow-x-auto">{result.code}</pre>
          </div>
        )}
      </CardContent>
    </Card>
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
