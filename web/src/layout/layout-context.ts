import type { AuthUser, PlatformModel, Problem } from '@/types'

export type LayoutContext = {
  models: PlatformModel[]
  problems: Problem[]
  user: AuthUser | null
  meLoading: boolean
  openSidebar: () => void
  logout: () => Promise<void>
  loginHref: string
}
