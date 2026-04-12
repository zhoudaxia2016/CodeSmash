import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '@/api/client'
import { LoginAutoSyncBattles } from '@/components/login-auto-sync-battles'
import { useMe, useModels, useProblems } from '@/hooks/useApi'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { Sidebar } from '@/layout/Sidebar'

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

  const navPrimedRef = useRef(false)
  useEffect(() => {
    if (!navPrimedRef.current) {
      navPrimedRef.current = true
      return
    }
    if (path === '/history') {
      void queryClient.invalidateQueries({ queryKey: ['models'] })
      void queryClient.invalidateQueries({ queryKey: ['problems'] })
      void queryClient.invalidateQueries({ queryKey: ['battle-results'] })
      return
    }

    if (path === '/problems') {
      void queryClient.invalidateQueries({ queryKey: ['models'] })
      void queryClient.invalidateQueries({ queryKey: ['problems'] })
      return
    }

    if (path === '/leaderboard') {
      void queryClient.invalidateQueries({ queryKey: ['problems'] })
      void queryClient.invalidateQueries({ queryKey: ['leaderboard'] })
      return
    }

    if (path.startsWith('/admin')) {
      if (user?.role === 'admin') {
        if (path === '/admin/logs') {
          void queryClient.invalidateQueries({ queryKey: ['admin', 'logs'] })
        } else {
          void queryClient.invalidateQueries({ queryKey: ['admin', 'models'] })
        }
      }
      return
    }

    {
        void queryClient.invalidateQueries({ queryKey: ['models'] })
        void queryClient.invalidateQueries({ queryKey: ['problems'] })
        void queryClient.invalidateQueries({ queryKey: ['battles'] })
    }
  }, [path, user?.role, queryClient])

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

  const handleNavigate = (to: string) => {
    navigate(to)
    if (isMobile) setSidebarOpen(false)
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

      <Sidebar
        isMobile={isMobile}
        loginHref={githubLoginHref()}
        meLoading={meLoading}
        onClose={() => setSidebarOpen(false)}
        onLogout={() => void handleLogout()}
        onNavigate={handleNavigate}
        open={sidebarOpen}
        user={user}
      />

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
