import { useCallback, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { BookOpen, Box, History, ScrollText, Swords, Trophy } from 'lucide-react'
import { api } from '@/api/client'
import { LoginAutoSyncBattles } from '@/components/login-auto-sync-battles'
import { BattleDetailNavProvider } from '@/context/battle-replay-nav'
import { useMe, useModels, useProblems } from '@/hooks/useApi'
import { Battle } from '@/pages/battle'
import { BattleHistory } from '@/pages/battle/history'
import { LeaderboardPage } from '@/pages/leaderboard'
import { ProblemsPage } from '@/pages/problems'
import { Admin } from '@/pages/admin'

type MainView = 'battle' | 'battleHistory' | 'problems' | 'leaderboard' | 'admin'
type AdminTab = 'models' | 'logs'

type ShellState = {
  view: MainView
  adminTab: AdminTab
  openBattleDetailId: string | null
}

function readBattleDetailIdFromUrl(): string | null {
  const q = new URLSearchParams(window.location.search)
  return q.get('battle') ?? q.get('replay')
}

function appPathFromLocation(): string {
  const rawBase = import.meta.env.BASE_URL
  const base = rawBase === '/' ? '' : rawBase.replace(/\/$/, '')
  let pathname = window.location.pathname
  if (base && (pathname === base || pathname.startsWith(`${base}/`))) {
    pathname = pathname === base ? '/' : pathname.slice(base.length) || '/'
  }
  if (!pathname.startsWith('/')) pathname = `/${pathname}`
  const normalized = pathname.replace(/\/$/, '') || '/'
  return normalized
}

function toFullPathname(appPath: string): string {
  const rawBase = import.meta.env.BASE_URL
  const base = rawBase === '/' ? '' : rawBase.replace(/\/$/, '')
  const p = appPath === '/' ? '/' : appPath.startsWith('/') ? appPath : `/${appPath}`
  if (!base) return p
  return p === '/' ? `${base}/` : `${base}${p}`
}

function parseAppPath(appPath: string): { view: MainView; adminTab: AdminTab } {
  const s = appPath.replace(/\/$/, '') || '/'
  if (s === '/' || s === '/battle') return { view: 'battle', adminTab: 'models' }
  if (s === '/history') return { view: 'battleHistory', adminTab: 'models' }
  if (s === '/problems') return { view: 'problems', adminTab: 'models' }
  if (s === '/leaderboard') return { view: 'leaderboard', adminTab: 'models' }
  if (s === '/admin/logs') return { view: 'admin', adminTab: 'logs' }
  if (s === '/admin') return { view: 'admin', adminTab: 'models' }
  return { view: 'battle', adminTab: 'models' }
}

function appPathForView(view: MainView, adminTab: AdminTab): string {
  switch (view) {
    case 'battle':
      return '/battle'
    case 'battleHistory':
      return '/history'
    case 'problems':
      return '/problems'
    case 'leaderboard':
      return '/leaderboard'
    case 'admin':
      return adminTab === 'logs' ? '/admin/logs' : '/admin'
  }
}

function readShellStateFromUrl(): ShellState {
  const { view, adminTab } = parseAppPath(appPathFromLocation())
  return {
    view,
    adminTab,
    openBattleDetailId: readBattleDetailIdFromUrl(),
  }
}

function buildHistoryHref(
  view: MainView,
  adminTab: AdminTab,
  battleId: string | null,
  mode: 'push' | 'replace',
): void {
  const path = toFullPathname(appPathForView(view, adminTab))
  const sp = new URLSearchParams(window.location.search)
  sp.delete('replay')
  if (view === 'battle' && battleId) sp.set('battle', battleId)
  else sp.delete('battle')
  const qs = sp.toString()
  const href = qs ? `${path}?${qs}` : path
  if (mode === 'push') window.history.pushState(null, '', href)
  else window.history.replaceState(null, '', href)
}

function mergeShell(prev: ShellState, patch: Partial<ShellState>): ShellState {
  const view = patch.view ?? prev.view
  const adminTab = patch.adminTab ?? prev.adminTab
  let openBattleDetailId = prev.openBattleDetailId
  if (patch.openBattleDetailId !== undefined) openBattleDetailId = patch.openBattleDetailId
  else if (patch.view !== undefined && patch.view !== 'battle') openBattleDetailId = null
  return { view, adminTab, openBattleDetailId }
}

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
  const [shell, setShell] = useState<ShellState>(() => readShellStateFromUrl())
  const { view, adminTab, openBattleDetailId } = shell
  const [authBanner, setAuthBanner] = useState<string | null>(null)

  const navigate = useCallback((patch: Partial<ShellState> & { replace?: boolean }) => {
    const { replace, ...rest } = patch
    setShell((prev) => {
      const next = mergeShell(prev, rest)
      buildHistoryHref(next.view, next.adminTab, next.openBattleDetailId, replace ? 'replace' : 'push')
      return next
    })
  }, [])

  const openBattleDetail = useCallback(
    (battleId: string) => {
      navigate({ view: 'battle', openBattleDetailId: battleId })
    },
    [navigate],
  )

  useEffect(() => {
    const onPop = () => setShell(readShellStateFromUrl())
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  /** 主壳 tab 切换时拉最新数据；顶层 `useModels`/`useProblems` 不会因切页卸载，仅靠全局 staleTime 不会重请求。 */
  const shellNavPrimedRef = useRef(false)
  useEffect(() => {
    if (!shellNavPrimedRef.current) {
      shellNavPrimedRef.current = true
      return
    }
    switch (view) {
      case 'battle':
        void queryClient.invalidateQueries({ queryKey: ['models'] })
        void queryClient.invalidateQueries({ queryKey: ['problems'] })
        void queryClient.invalidateQueries({ queryKey: ['battles'] })
        break
      case 'battleHistory':
        void queryClient.invalidateQueries({ queryKey: ['models'] })
        void queryClient.invalidateQueries({ queryKey: ['problems'] })
        void queryClient.invalidateQueries({ queryKey: ['battle-results'] })
        break
      case 'problems':
        void queryClient.invalidateQueries({ queryKey: ['models'] })
        void queryClient.invalidateQueries({ queryKey: ['problems'] })
        break
      case 'leaderboard':
        void queryClient.invalidateQueries({ queryKey: ['problems'] })
        void queryClient.invalidateQueries({ queryKey: ['leaderboard'] })
        break
      case 'admin':
        if (user?.role === 'admin') {
          if (adminTab === 'models') {
            void queryClient.invalidateQueries({ queryKey: ['admin', 'models'] })
          } else {
            void queryClient.invalidateQueries({ queryKey: ['admin', 'logs'] })
          }
        }
        break
      default:
        break
    }
  }, [view, adminTab, user?.role, queryClient])

  useEffect(() => {
    const err = new URLSearchParams(window.location.search).get('auth_error')
    if (!err) return
    setAuthBanner('登录失败，请检查 GitHub OAuth 配置后重试。')
    const url = new URL(window.location.href)
    url.searchParams.delete('auth_error')
    const qs = url.searchParams.toString()
    window.history.replaceState(null, '', qs ? `${url.pathname}?${qs}` : url.pathname)
    setShell(readShellStateFromUrl())
  }, [])

  const handleLogout = async () => {
    try {
      await api.logout()
    } finally {
      queryClient.setQueryData(['me'], { user: null })
      void queryClient.removeQueries({ queryKey: ['battle-results'] })
      void queryClient.invalidateQueries({ queryKey: ['me'] })
      navigate({ openBattleDetailId: null, replace: true })
    }
  }

  return (
    <BattleDetailNavProvider value={{ openBattleDetail }}>
    <div className="flex h-full min-h-0 overflow-hidden bg-background">
      <LoginAutoSyncBattles user={user} />
      <aside className="flex w-64 shrink-0 flex-col overflow-y-auto border-r border-arena-sidebar-border bg-arena-sidebar p-4">
        <div className="flex items-center gap-2.5 mb-8 px-2">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center ring-1 ring-white/10">
            <span className="text-white font-bold text-sm tracking-tight">CS</span>
          </div>
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="font-semibold text-foreground tracking-tight truncate">CodeSmash</span>
            <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">
              Arena
            </span>
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 min-h-0" aria-label="Main">
          <button
            type="button"
            onClick={() => navigate({ view: 'battle', openBattleDetailId: null })}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left ${
              view === 'battle'
                ? 'bg-arena-sidebar-active text-arena-sidebar-active-fg shadow-arena'
                : 'text-arena-sidebar-foreground hover:bg-arena-sidebar-active/60 hover:text-foreground'
            }`}
          >
            <Swords
              className="h-[18px] w-[18px] shrink-0"
              strokeWidth={2}
              aria-hidden
            />
            对战
          </button>
          <button
            type="button"
            onClick={() => navigate({ view: 'battleHistory' })}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left ${
              view === 'battleHistory'
                ? 'bg-arena-sidebar-active text-arena-sidebar-active-fg shadow-arena'
                : 'text-arena-sidebar-foreground hover:bg-arena-sidebar-active/60 hover:text-foreground'
            }`}
          >
            <History
              className="h-[18px] w-[18px] shrink-0"
              strokeWidth={2}
              aria-hidden
            />
            对战历史
          </button>
          <button
            type="button"
            onClick={() => navigate({ view: 'problems' })}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left ${
              view === 'problems'
                ? 'bg-arena-sidebar-active text-arena-sidebar-active-fg shadow-arena'
                : 'text-arena-sidebar-foreground hover:bg-arena-sidebar-active/60 hover:text-foreground'
            }`}
          >
            <BookOpen
              className="h-[18px] w-[18px] shrink-0"
              strokeWidth={2}
              aria-hidden
            />
            题库
          </button>
          <button
            type="button"
            onClick={() => navigate({ view: 'leaderboard' })}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left ${
              view === 'leaderboard'
                ? 'bg-arena-sidebar-active text-arena-sidebar-active-fg shadow-arena'
                : 'text-arena-sidebar-foreground hover:bg-arena-sidebar-active/60 hover:text-foreground'
            }`}
          >
            <Trophy
              className="h-[18px] w-[18px] shrink-0"
              strokeWidth={2}
              aria-hidden
            />
            排行榜
          </button>
          {user?.role === 'admin' && (
            <div className="mt-1 space-y-0.5">
              <p className="px-3 pt-1 pb-0.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                管理后台
              </p>
              <button
                type="button"
                onClick={() => navigate({ view: 'admin', adminTab: 'models' })}
                className={`flex w-full items-center gap-3 rounded-lg py-2 pl-6 pr-3 text-sm font-medium transition-colors text-left ${
                  view === 'admin' && adminTab === 'models'
                    ? 'bg-arena-sidebar-active text-arena-sidebar-active-fg shadow-arena'
                    : 'text-arena-sidebar-foreground hover:bg-arena-sidebar-active/60 hover:text-foreground'
                }`}
              >
                <Box
                  className="h-[18px] w-[18px] shrink-0"
                  strokeWidth={2}
                  aria-hidden
                />
                模型
              </button>
              <button
                type="button"
                onClick={() => navigate({ view: 'admin', adminTab: 'logs' })}
                className={`flex w-full items-center gap-3 rounded-lg py-2 pl-6 pr-3 text-sm font-medium transition-colors text-left ${
                  view === 'admin' && adminTab === 'logs'
                    ? 'bg-arena-sidebar-active text-arena-sidebar-active-fg shadow-arena'
                    : 'text-arena-sidebar-foreground hover:bg-arena-sidebar-active/60 hover:text-foreground'
                }`}
              >
                <ScrollText
                  className="h-[18px] w-[18px] shrink-0"
                  strokeWidth={2}
                  aria-hidden
                />
                日志
              </button>
            </div>
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
                <h1 className="shrink-0 text-xl font-semibold tracking-tight text-foreground">对战</h1>
                <div
                  id="battle-header-slot"
                  className="flex min-w-0 flex-1 flex-wrap items-center gap-2 lg:justify-end"
                />
              </div>
            ) : view === 'problems' ? (
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between lg:gap-6">
                <h1 className="shrink-0 text-xl font-semibold tracking-tight text-foreground">题库</h1>
                <div
                  id="problems-header-slot"
                  className="flex min-w-0 flex-1 flex-wrap items-center gap-2 lg:justify-end"
                />
              </div>
            ) : view === 'battleHistory' ? (
              <h1 className="text-xl font-semibold tracking-tight text-foreground">对战历史</h1>
            ) : view === 'admin' ? (
              <h1 className="text-xl font-semibold tracking-tight text-foreground">
                {adminTab === 'logs' ? '日志' : '模型'}
              </h1>
            ) : (
              <h1 className="text-xl font-semibold tracking-tight text-foreground">排行榜</h1>
            )}
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-7xl px-6 py-8 sm:px-8 lg:px-10">
            {view === 'battle' && (
              <Battle
                models={models}
                problems={problems}
                openBattleDetailId={openBattleDetailId}
                onClearOpenBattleDetail={() => navigate({ openBattleDetailId: null, replace: true })}
              />
            )}
            {view === 'battleHistory' && <BattleHistory />}
            {view === 'problems' && <ProblemsPage />}
            {view === 'leaderboard' && <LeaderboardPage />}
            {view === 'admin' && user?.role === 'admin' && <Admin tab={adminTab} />}
            {view === 'admin' && user?.role !== 'admin' && (
              <p className="text-sm text-muted-foreground">需要管理员权限。</p>
            )}
          </div>
        </main>
      </div>
    </div>
    </BattleDetailNavProvider>
  )
}

export default App
