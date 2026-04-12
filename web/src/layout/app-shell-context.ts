// TODO: 迁移位置
import type { AuthUser, PlatformModel, Problem } from '@/types'

export type AppShellContext = {
  models: PlatformModel[]
  problems: Problem[]
  user: AuthUser | null
  meLoading: boolean
  openSidebar: () => void
  logout: () => Promise<void>
  loginHref: string
}
