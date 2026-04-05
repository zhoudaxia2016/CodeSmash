import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useMe, useModels, useProblems } from '@/hooks/useApi'
import { Battle } from '@/pages/battle'
import { LeaderboardPage } from '@/pages/leaderboard'
import { ProblemsPage } from '@/pages/problems'
import { Admin } from '@/pages/admin'

type MainView = 'battle' | 'problems' | 'leaderboard' | 'admin'
type AdminTab = 'models' | 'logs'

function githubLoginHref(): string {
  const apiBase = import.meta.env.VITE_API_URL?.trim().replace(/\/$/, '') ?? ''
  const postLogin = window.location.href.split('#')[0]
  if (apiBase) {
    return `${apiBase}/api/auth/github?post_login=${encodeURIComponent(postLogin)}`
  }
  return `${window.location.origin}/api/auth/github`
}

function App() {
  const queryClient = useQueryClient()
  const { data: meData, isLoading: meLoading } = useMe()
  const user = meData?.user ?? null
  const { data: models = [] } = useModels()
  const { data: problems = [] } = useProblems()
  const [view, setView] = useState<MainView>('battle')
  const [adminTab, setAdminTab] = useState<AdminTab>('models')
  const [authBanner, setAuthBanner] = useState<string | null>(null)

  useEffect(() => {
    const err = new URLSearchParams(window.location.search).get('auth_error')
    if (err) {
      setAuthBanner('登录失败，请检查 GitHub OAuth 配置后重试。')
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  const handleLogout = async () => {
    try {
      await api.logout()
    } finally {
      queryClient.setQueryData(['me'], { user: null })
      void queryClient.invalidateQueries({ queryKey: ['me'] })
    }
  }

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
        <nav className="flex flex-1 flex-col gap-0.5 min-h-0" aria-label="Main">
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
          {user?.role === 'admin' && (
            <button
              type="button"
              onClick={() => setView('admin')}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left ${
                view === 'admin'
                  ? 'bg-arena-sidebar-active text-arena-sidebar-active-fg shadow-arena'
                  : 'text-arena-sidebar-foreground hover:bg-arena-sidebar-active/60 hover:text-foreground'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${
                  view === 'admin' ? 'bg-amber-400/90' : 'bg-muted-foreground/40'
                }`}
              />
              Admin
            </button>
          )}
        </nav>

        <div className="mt-4 shrink-0 border-t border-arena-sidebar-border pt-4 px-1 space-y-2">
          {meLoading ? (
            <p className="text-xs text-muted-foreground px-2">会话…</p>
          ) : user ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 min-w-0 px-2">
                {user.avatarUrl ? (
                  <img
                    src={user.avatarUrl}
                    alt=""
                    className="h-8 w-8 rounded-full shrink-0 ring-1 ring-border"
                  />
                ) : (
                  <div className="h-8 w-8 rounded-full bg-muted shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-foreground truncate">
                    {user.name ?? user.login}
                  </p>
                  <p className="text-[10px] text-muted-foreground truncate">@{user.login}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => void handleLogout()}
                className="w-full rounded-md border border-border/80 bg-background/50 px-2 py-1.5 text-xs font-medium text-foreground hover:bg-muted/50"
              >
                退出
              </button>
            </div>
          ) : (
            <a
              href={githubLoginHref()}
              className="flex w-full items-center justify-center rounded-md bg-foreground px-2 py-2 text-xs font-medium text-background hover:opacity-90"
            >
              GitHub 登录
            </a>
          )}
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden">
        <header
          id="app-shell-header"
          className="relative z-10 shrink-0 overflow-visible border-b border-border/80 bg-arena-header-blur/85 backdrop-blur-md supports-[backdrop-filter]:bg-background/75"
        >
          <div className="mx-auto w-full max-w-7xl px-6 py-4 sm:px-8 lg:px-10">
            {authBanner && (
              <p className="mb-3 text-sm text-destructive" role="alert">
                {authBanner}
                <button
                  type="button"
                  className="ml-2 underline"
                  onClick={() => setAuthBanner(null)}
                >
                  关闭
                </button>
              </p>
            )}
            {view === 'battle' ? (
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between lg:gap-6">
                <h1 className="shrink-0 text-xl font-semibold tracking-tight text-foreground">Battle</h1>
                <div
                  id="battle-header-slot"
                  className="flex min-w-0 flex-1 flex-wrap items-center gap-2 lg:justify-end"
                />
              </div>
            ) : view === 'problems' ? (
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between lg:gap-6">
                <h1 className="shrink-0 text-xl font-semibold tracking-tight text-foreground">题目库</h1>
                <div
                  id="problems-header-slot"
                  className="flex min-w-0 flex-1 flex-wrap items-center gap-2 lg:justify-end"
                />
              </div>
            ) : view === 'admin' ? (
              <h1 className="text-xl font-semibold tracking-tight text-foreground">后台</h1>
            ) : (
              <h1 className="text-xl font-semibold tracking-tight text-foreground">Leaderboard</h1>
            )}
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-7xl px-6 py-8 sm:px-8 lg:px-10">
            {view === 'battle' && <Battle models={models} problems={problems} />}
            {view === 'problems' && <ProblemsPage />}
            {view === 'leaderboard' && <LeaderboardPage />}
            {view === 'admin' && user?.role === 'admin' && (
              <Admin tab={adminTab} onTabChange={setAdminTab} />
            )}
            {view === 'admin' && user?.role !== 'admin' && (
              <p className="text-sm text-muted-foreground">需要管理员权限。</p>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}

export default App
