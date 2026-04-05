import type { BattleSession } from '@/types'

const STORAGE_KEY = 'codesmesh:battle-history'

export type LocalBattleHistoryEntry = {
  id: string
  savedAt: string
  syncedAt: string | null
  battle: BattleSession
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null
}

function parseEntry(x: unknown): LocalBattleHistoryEntry | null {
  if (!isRecord(x)) return null
  if (typeof x.id !== 'string' || typeof x.savedAt !== 'string') return null
  if (x.syncedAt != null && typeof x.syncedAt !== 'string') return null
  if (!isRecord(x.battle) || typeof x.battle.id !== 'string') return null
  return {
    id: x.id,
    savedAt: x.savedAt,
    syncedAt: x.syncedAt == null ? null : x.syncedAt,
    battle: x.battle as unknown as BattleSession,
  }
}

export function loadLocalBattleHistory(): LocalBattleHistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.map(parseEntry).filter((e): e is LocalBattleHistoryEntry => e != null)
  } catch {
    return []
  }
}

function writeAll(entries: LocalBattleHistoryEntry[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
}

/** Persist terminal battles (completed / failed). */
export function saveBattleToLocalHistory(battle: BattleSession): void {
  if (battle.status !== 'completed' && battle.status !== 'failed') return
  const list = loadLocalBattleHistory()
  const idx = list.findIndex((e) => e.id === battle.id)
  const now = new Date().toISOString()
  const next: LocalBattleHistoryEntry = {
    id: battle.id,
    savedAt: idx >= 0 ? list[idx].savedAt : now,
    syncedAt: idx >= 0 ? list[idx].syncedAt : null,
    battle,
  }
  if (idx >= 0) list[idx] = next
  else list.unshift(next)
  writeAll(list)
}

export function getLocalBattleEntry(battleId: string): LocalBattleHistoryEntry | null {
  return loadLocalBattleHistory().find((e) => e.id === battleId) ?? null
}

export function markBattleSyncedLocal(battleId: string): void {
  const list = loadLocalBattleHistory()
  const now = new Date().toISOString()
  const idx = list.findIndex((e) => e.id === battleId)
  if (idx < 0) return
  list[idx] = { ...list[idx], syncedAt: now }
  writeAll(list)
}
