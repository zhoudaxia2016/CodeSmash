import type { BattleSession, ModelResult } from '@/types'

/** Must match server `modelSeedUuids.ts` / migration map for slug → UUID. */
const LEGACY_MODEL_ID_MAP: Record<string, string> = {
  'minimax-2.7': '018f0e2a-1111-7111-a111-000000000001',
  'deepseek-v3': '018f0e2a-2222-7222-a222-000000000002',
}

function rep(id: string): string {
  return LEGACY_MODEL_ID_MAP[id] ?? id
}

function patchSide(side: ModelResult | null | undefined): boolean {
  if (!side || typeof side.modelId !== 'string') return false
  const next = rep(side.modelId)
  if (next === side.modelId) return false
  side.modelId = next
  return true
}

/** Rewrite slug ids in a stored battle (localStorage). Returns whether anything changed. */
export function migrateLegacyModelIdsInStoredBattle(battle: BattleSession): boolean {
  let changed = false
  const na = rep(battle.modelAId)
  if (na !== battle.modelAId) {
    battle.modelAId = na
    changed = true
  }
  const nb = rep(battle.modelBId)
  if (nb !== battle.modelBId) {
    battle.modelBId = nb
    changed = true
  }
  if (patchSide(battle.modelAResult)) changed = true
  if (patchSide(battle.modelBResult)) changed = true
  return changed
}
