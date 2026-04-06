import type { AuthUser, BattleSession } from '@/types'

const STORAGE_KEY = 'codesmash:battle-history'

export type LocalBattleCreatorSnapshot = Pick<AuthUser, 'id' | 'login' | 'name' | 'avatarUrl'>

export type LocalBattleHistoryEntry = {
  id: string
  savedAt: string
  syncedAt: string | null
  /** Present when the battle was saved while a user was logged in. */
  creatorSnapshot?: LocalBattleCreatorSnapshot | null
  battle: BattleSession
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null
}

function parseCreatorSnapshot(x: unknown): LocalBattleCreatorSnapshot | null | undefined {
  if (x === undefined) return undefined
  if (x == null) return null
  if (!isRecord(x)) return null
  if (typeof x.id !== 'string' || typeof x.login !== 'string') return null
  return {
    id: x.id,
    login: x.login,
    name: typeof x.name === 'string' || x.name === null ? x.name : null,
    avatarUrl:
      typeof x.avatarUrl === 'string' || x.avatarUrl === null ? x.avatarUrl : null,
  }
}

function parseEntry(x: unknown): LocalBattleHistoryEntry | null {
  if (!isRecord(x)) return null
  if (typeof x.id !== 'string' || typeof x.savedAt !== 'string') return null
  if (x.syncedAt != null && typeof x.syncedAt !== 'string') return null
  if (!isRecord(x.battle) || typeof x.battle.id !== 'string') return null
  const creatorSnapshot = parseCreatorSnapshot(x.creatorSnapshot)
  return {
    id: x.id,
    savedAt: x.savedAt,
    syncedAt: x.syncedAt == null ? null : x.syncedAt,
    ...(creatorSnapshot !== undefined ? { creatorSnapshot } : {}),
    battle: x.battle as unknown as BattleSession,
  }
}

export function loadLocalBattleHistory(): LocalBattleHistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    const list = parsed.map(parseEntry).filter((e): e is LocalBattleHistoryEntry => e != null)
    const pruned = list.filter((e) => e.syncedAt == null)
    if (pruned.length !== list.length) {
      writeAll(pruned)
    }
    return pruned
  } catch {
    return []
  }
}

function writeAll(entries: LocalBattleHistoryEntry[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
}

function toCreatorSnapshot(
  user: Pick<AuthUser, 'id' | 'login' | 'name' | 'avatarUrl'>,
): LocalBattleCreatorSnapshot {
  return {
    id: user.id,
    login: user.login,
    name: user.name,
    avatarUrl: user.avatarUrl,
  }
}

/** Persist terminal battles (completed / failed). */
export function saveBattleToLocalHistory(
  battle: BattleSession,
  user: Pick<AuthUser, 'id' | 'login' | 'name' | 'avatarUrl'> | null,
): void {
  if (battle.status !== 'completed' && battle.status !== 'failed') return
  const list = loadLocalBattleHistory()
  const idx = list.findIndex((e) => e.id === battle.id)
  const now = new Date().toISOString()
  const prev = idx >= 0 ? list[idx] : null
  const next: LocalBattleHistoryEntry = {
    id: battle.id,
    savedAt: prev?.savedAt ?? now,
    syncedAt: prev?.syncedAt ?? null,
    creatorSnapshot: user ? toCreatorSnapshot(user) : null,
    battle,
  }
  if (idx >= 0) list[idx] = next
  else list.unshift(next)
  writeAll(list)
}

export function getLocalBattleEntry(battleId: string): LocalBattleHistoryEntry | null {
  return loadLocalBattleHistory().find((e) => e.id === battleId) ?? null
}

/** Remove a battle from local history (e.g. after successful cloud sync). */
export function removeLocalBattleEntry(battleId: string): void {
  const list = loadLocalBattleHistory()
  const next = list.filter((e) => e.id !== battleId)
  if (next.length === list.length) return
  writeAll(next)
}
