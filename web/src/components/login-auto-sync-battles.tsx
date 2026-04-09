import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import type { AuthUser } from '@/types'
import { loadLocalBattleHistory, removeLocalBattleEntry } from '@/utils/battle-local-history'

type Props = {
  user: AuthUser | null
}

/** 登录后静默同步本机未上传的对战（无弹窗）。 */
export function LoginAutoSyncBattles({ user }: Props) {
  const queryClient = useQueryClient()
  const prevUserId = useRef<string | null>(null)

  useEffect(() => {
    const id = user?.id ?? null
    const becameLoggedIn = prevUserId.current === null && id != null
    prevUserId.current = id

    if (!becameLoggedIn || !user) return

    const unsynced = loadLocalBattleHistory()
    if (unsynced.length === 0) return

    void (async () => {
      try {
        for (const e of unsynced) {
          await api.postBattleResult(e.battle)
          removeLocalBattleEntry(e.battle.id)
        }
        void queryClient.invalidateQueries({ queryKey: ['battle-results'] })
      } catch {
        /* 保留本机记录，用户可在对战历史中重试 */
      }
    })()
  }, [user, queryClient])

  return null
}
