import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { AuthUser } from '@/types'

type Props = {
  user: AuthUser | null
  meLoading: boolean
  onLogout: () => Promise<void>
  loginHref: string
}

export function AccountControl({ user, meLoading, onLogout, loginHref }: Props) {
  if (meLoading) {
    return <span className="inline-flex h-9 items-center text-xs text-muted-foreground">会话…</span>
  }

  if (user) {
    const displayName = user.name ?? user.login
    return (
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border/80 bg-background/60"
            aria-label="账号菜单"
          >
            {user.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt={displayName}
                className="h-8 w-8 rounded-full ring-1 ring-border"
              />
            ) : (
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground">
                {displayName.slice(0, 1).toUpperCase()}
              </span>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-44 p-3">
          <p className="truncate text-sm font-medium text-foreground">{displayName}</p>
          <p className="truncate text-xs text-muted-foreground">@{user.login}</p>
          <button
            type="button"
            className="mt-2 inline-flex h-8 w-full items-center justify-center rounded-md border border-border/80 px-2 text-xs font-medium text-foreground hover:bg-muted/50"
            onClick={() => void onLogout()}
          >
            退出登录
          </button>
        </PopoverContent>
      </Popover>
    )
  }

  return (
    <a
      href={loginHref}
      className="inline-flex h-9 items-center justify-center rounded-md bg-foreground px-3 text-sm font-medium text-background hover:opacity-90"
    >
      登录
    </a>
  )
}
