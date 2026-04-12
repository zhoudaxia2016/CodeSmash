const STORAGE_KEY = 'codesmash:battle-setup-prefs'

export type BattleSetupPrefs = {
  problemId?: string
  modelAId?: string
  modelBId?: string
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null
}

export function loadBattleSetupPrefs(): BattleSetupPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!isRecord(parsed)) return {}
    const out: BattleSetupPrefs = {}
    if (typeof parsed.problemId === 'string' && parsed.problemId) out.problemId = parsed.problemId
    if (typeof parsed.modelAId === 'string' && parsed.modelAId) out.modelAId = parsed.modelAId
    if (typeof parsed.modelBId === 'string' && parsed.modelBId) out.modelBId = parsed.modelBId
    return out
  } catch {
    return {}
  }
}

export function saveBattleSetupPrefs(patch: Partial<BattleSetupPrefs>): BattleSetupPrefs {
  const next = { ...loadBattleSetupPrefs(), ...patch }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  return next
}
