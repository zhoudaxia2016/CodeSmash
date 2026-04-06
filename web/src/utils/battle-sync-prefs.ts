const STORAGE_KEY = 'codesmash:battle-sync-prefs'

export type BattleSyncPrefs = {
  /**
   * 登录后把未上传的本机记录同步到云端；对战结束且已登录时直接上传云端（不写本机）。
   */
  autoSyncWhenLoggedIn: boolean
}

const DEFAULTS: BattleSyncPrefs = {
  autoSyncWhenLoggedIn: true,
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null
}

function migrateFromLegacy(parsed: Record<string, unknown>): BattleSyncPrefs {
  if (typeof parsed.autoSyncWhenLoggedIn === 'boolean') {
    return { autoSyncWhenLoggedIn: parsed.autoSyncWhenLoggedIn }
  }
  if (typeof parsed.autoSyncOnLogin === 'boolean') {
    return { autoSyncWhenLoggedIn: parsed.autoSyncOnLogin }
  }
  if (typeof parsed.suppressLoginSyncPrompt === 'boolean') {
    return { autoSyncWhenLoggedIn: !parsed.suppressLoginSyncPrompt }
  }
  return { ...DEFAULTS }
}

export function loadBattleSyncPrefs(): BattleSyncPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULTS }
    const parsed = JSON.parse(raw) as unknown
    if (!isRecord(parsed)) return { ...DEFAULTS }
    return migrateFromLegacy(parsed)
  } catch {
    return { ...DEFAULTS }
  }
}

export function saveBattleSyncPrefs(patch: Partial<BattleSyncPrefs>): BattleSyncPrefs {
  const next = { ...loadBattleSyncPrefs(), ...patch }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  return next
}
