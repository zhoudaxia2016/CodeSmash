import { BookOpen, Box, History, ScrollText, Swords, Trophy, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useMatch, useResolvedPath } from 'react-router-dom'
import type { AuthUser } from '@/types'

type Props = {
  isMobile: boolean
  loginHref: string
  meLoading: boolean
  onClose: () => void
  onLogout: () => void
  onNavigate: (path: string) => void
  open: boolean
  user: AuthUser | null
}

function itemClass(active: boolean, indent = false): string {
  return `flex items-center gap-3 rounded-lg ${indent ? 'w-full py-2 pl-6 pr-3' : 'px-3 py-2.5'} text-left text-sm font-medium transition-colors ${
    active
      ? 'bg-arena-sidebar-active text-arena-sidebar-active-fg shadow-arena'
      : 'text-arena-sidebar-foreground hover:bg-arena-sidebar-active/60 hover:text-foreground'
  }`
}

type NavButtonProps = {
  end?: boolean
  href: string
  icon: LucideIcon
  indent?: boolean
  label: string
  onNavigate: (path: string) => void
}

function NavButton({
  end = true,
  href,
  icon: Icon,
  indent = false,
  label,
  onNavigate,
}: NavButtonProps) {
  const resolvedPath = useResolvedPath(href)
  const active = useMatch({ path: resolvedPath.pathname, end }) !== null

  return (
    <button
      type="button"
      onClick={() => onNavigate(href)}
      className={itemClass(active, indent)}
    >
      <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={2} aria-hidden />
      {label}
    </button>
  )
}

export function Sidebar({
  isMobile,
  loginHref,
  meLoading,
  onClose,
  onLogout,
  onNavigate,
  open,
  user,
}: Props) {
  return (
    <aside
      className={`
        fixed inset-y-0 left-0 z-50 flex w-64 flex-col overflow-y-auto border-r border-arena-sidebar-border bg-arena-sidebar p-4 transition-transform duration-300
        lg:static lg:z-auto lg:shrink-0 lg:transition-none
        ${open || !isMobile ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}
    >
      <div className="mb-8 flex items-center justify-between gap-2.5 px-2">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 ring-1 ring-white/10">
            <span className="text-sm font-bold tracking-tight text-white">CS</span>
          </div>
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="truncate font-semibold tracking-tight text-foreground">CodeSmash</span>
            <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Arena
            </span>
          </div>
        </div>
        {isMobile ? (
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 hover:bg-arena-sidebar-active/60"
            aria-label="关闭菜单"
          >
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        ) : null}
      </div>

      <nav className="flex min-h-0 flex-1 flex-col gap-0.5" aria-label="Main">
        <NavButton
          href="/battle"
          icon={Swords}
          label="对战"
          onNavigate={onNavigate}
        />
        <NavButton
          href="/history"
          icon={History}
          label="对战历史"
          onNavigate={onNavigate}
        />
        <NavButton
          href="/problems"
          icon={BookOpen}
          label="题库"
          onNavigate={onNavigate}
        />
        <NavButton
          href="/leaderboard"
          icon={Trophy}
          label="排行榜"
          onNavigate={onNavigate}
        />

        {user?.role === 'admin' ? (
          <div className="mt-1 space-y-0.5">
            <p className="px-3 pb-0.5 pt-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              管理后台
            </p>
            <NavButton
              end={false}
              href="/admin/models"
              icon={Box}
              indent
              label="模型"
              onNavigate={onNavigate}
            />
            <NavButton
              href="/admin/logs"
              icon={ScrollText}
              indent
              label="日志"
              onNavigate={onNavigate}
            />
          </div>
        ) : null}
      </nav>

      <div className="mt-4 shrink-0 space-y-2 border-t border-arena-sidebar-border px-1 pt-4">
        {meLoading ? (
          <p className="px-2 text-xs text-muted-foreground">会话…</p>
        ) : user ? (
          <div className="space-y-2">
            <div className="flex min-w-0 items-center gap-2 px-2">
              {user.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt=""
                  className="h-8 w-8 shrink-0 rounded-full ring-1 ring-border"
                />
              ) : (
                <div className="h-8 w-8 shrink-0 rounded-full bg-muted" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-foreground">
                  {user.name ?? user.login}
                </p>
                <p className="truncate text-[10px] text-muted-foreground">@{user.login}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onLogout}
              className="w-full rounded-md border border-border/80 bg-background/50 px-2 py-1.5 text-xs font-medium text-foreground hover:bg-muted/50"
            >
              退出
            </button>
          </div>
        ) : (
          <a
            href={loginHref}
            className="flex w-full items-center justify-center rounded-md bg-foreground px-2 py-2 text-xs font-medium text-background hover:opacity-90"
          >
            GitHub 登录
          </a>
        )}
      </div>
    </aside>
  )
}
