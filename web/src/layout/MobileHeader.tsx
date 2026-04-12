import type { ReactNode } from 'react'
import { Menu } from 'lucide-react'
import { AccountControl } from './AccountControl'
import { useOutletContext } from 'react-router-dom'
import type { LayoutContext } from './layout-context'

type Props = {
  title: ReactNode
  children?: ReactNode
}

export function MobileHeader({
  title,
  children,
}: Props) {
  const { openSidebar, user, meLoading, logout, loginHref } = useOutletContext<LayoutContext>()
  return (
    <div
      data-page-header
      className="fixed inset-x-0 top-0 z-30 h-16 border-b border-border/80 bg-arena-header-blur/85 backdrop-blur-md supports-[backdrop-filter]:bg-background/75 lg:left-64"
    >
      <div className="mx-auto grid h-full w-full max-w-7xl grid-cols-[4.5rem_1fr_4.5rem] items-center gap-2 px-4 sm:px-6 lg:px-10">
        <div className="flex w-[4.5rem] items-center justify-start">
          <button
            type="button"
            className="inline-flex h-9 w-[4.5rem] items-center justify-center gap-1 rounded-md border border-border/80 px-2 text-sm font-medium text-foreground hover:bg-muted/50"
            onClick={openSidebar}
            aria-label="打开菜单"
          >
            <Menu className="h-4 w-4" aria-hidden />
            菜单
          </button>
        </div>
        <p className="truncate text-center text-base font-semibold tracking-tight text-foreground leading-none">
          {title}
        </p>
        <div className="flex w-[4.5rem] items-center justify-end">
          {children ?? (
            <AccountControl
              user={user}
              meLoading={meLoading}
              onLogout={logout}
              loginHref={loginHref}
            />
          )}
        </div>
      </div>
    </div>
  )
}
