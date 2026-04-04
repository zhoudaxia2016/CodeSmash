import { useState } from 'react'
import { useModels, useProblems } from '@/hooks/useApi'
import { Battle } from '@/pages/battle'
import { LeaderboardPage } from '@/pages/leaderboard'
import { ProblemsPage } from '@/pages/problems'

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
            {view === 'battle' ? (
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between lg:gap-6">
                <h1 className="shrink-0 text-xl font-semibold tracking-tight text-foreground">Battle</h1>
                <div
                  id="battle-header-slot"
                  className="flex min-w-0 flex-1 flex-wrap items-center gap-2 lg:justify-end"
                />
              </div>
            ) : (
              <h1 className="text-xl font-semibold tracking-tight text-foreground">
                {view === 'problems' && 'Problems'}
                {view === 'leaderboard' && 'Leaderboard'}
              </h1>
            )}
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-7xl px-6 py-8 sm:px-8 lg:px-10">
            {view === 'battle' && <Battle models={models} problems={problems} />}
            {view === 'problems' && <ProblemsPage />}
            {view === 'leaderboard' && <LeaderboardPage />}
          </div>
        </main>
      </div>
    </div>
  )
}

export default App
