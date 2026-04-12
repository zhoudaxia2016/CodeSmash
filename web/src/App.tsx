import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { BookOpen, Box, History, ScrollText, Swords, Trophy, X } from 'lucide-react'
import { api } from '@/api/client'
import { LoginAutoSyncBattles } from '@/components/login-auto-sync-battles'
import { useMe, useModels, useProblems } from '@/hooks/useApi'
import { useMediaQuery } from '@/hooks/useMediaQuery'

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
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [authBanner, setAuthBanner] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const isMobile = useMediaQuery('(max-width: 1023px)')

  const path = location.pathname
  const view =
    path === '/history' ? 'battleHistory' :
    path === '/problems' ? 'problems' :
    path === '/leaderboard' ? 'leaderboard' :
    path.startsWith('/admin') ? 'admin' : 'battle'

  const adminTab: AdminTab = path === '/admin/logs' ? 'logs' : 'models'

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
    const err = searchParams.get('auth_error')
    if (!err) return
    setAuthBanner('登录失败，请检查 GitHub OAuth 配置后重试。')
    const newSearchParams = new URLSearchParams(searchParams)
    newSearchParams.delete('auth_error')
    const qs = newSearchParams.toString()
    navigate(
      {
        pathname: location.pathname,
        search: qs ? `?${qs}` : '',
      },
      { replace: true }
    )
  }, [])

  const handleLogout = async () => {
    try {
      await api.logout()
    } finally {
      queryClient.setQueryData(['me'], { user: null })
      void queryClient.removeQueries({ queryKey: ['battle-results'] })
      void queryClient.invalidateQueries({ queryKey: ['me'] })
      navigate(
        {
          pathname: location.pathname,
          search: '',
        },
        { replace: true }
      )
    }
  }

  return (
    <div className="flex h-full min-h-0 overflow-hidden bg-background">
      <LoginAutoSyncBattles user={user} />

      {isMobile && sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside className={`
        fixed inset-y-0 left-0 z-50 w-64 flex flex-col overflow-y-auto border-r border-arena-sidebar-border bg-arena-sidebar p-4 transition-transform duration-300
        lg:static lg:z-auto lg:shrink-0 lg:transition-none
        ${sidebarOpen || !isMobile ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        <div className="flex items-center justify-between gap-2.5 mb-8 px-2">
          <div className="flex items-center gap-2.5">
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
          {isMobile && (
            <button
              type="button"
              onClick={() => setSidebarOpen(false)}
              className="p-1.5 rounded-md hover:bg-arena-sidebar-active/60"
              aria-label="关闭菜单"
            >
              <X className="h-5 w-5 text-muted-foreground" />
            </button>
          )}
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 min-h-0" aria-label="Main">
          <button
            type="button"
            onClick={() => {
              navigate('/battle')
              if (isMobile) setSidebarOpen(false)
            }}
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
            onClick={() => {
              navigate('/history')
              if (isMobile) setSidebarOpen(false)
            }}
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
            onClick={() => {
              navigate('/problems')
              if (isMobile) setSidebarOpen(false)
            }}
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
            onClick={() => {
              navigate('/leaderboard')
              if (isMobile) setSidebarOpen(false)
            }}
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
                onClick={() => {
                  navigate('/admin/models')
                  if (isMobile) setSidebarOpen(false)
                }}
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
                onClick={() => {
                  navigate('/admin/logs')
                  if (isMobile) setSidebarOpen(false)
                }}
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
        <main className="min-h-0 flex-1 overflow-y-auto">
          {authBanner && (
            <div className="mx-auto w-full max-w-7xl px-4 pt-5 sm:px-6 sm:pt-6 lg:px-10 lg:pt-8">
              <p className="text-sm text-destructive" role="alert">
                {authBanner}
                <button
                  type="button"
                  className="ml-2 underline"
                  onClick={() => setAuthBanner(null)}
                >
                  关闭
                </button>
              </p>
            </div>
          )}
          <div className="mx-auto w-full max-w-7xl px-4 pt-16 pb-5 sm:px-6 sm:pt-16 sm:pb-6 lg:px-10 lg:pt-16 lg:pb-8">
            <Outlet
              context={{
                models,
                problems,
                user,
                openSidebar: () => setSidebarOpen(true),
                logout: handleLogout,
                meLoading,
                loginHref: githubLoginHref(),
              }}
            />
          </div>
        </main>
      </div>
    </div>
  )
}

export default App
