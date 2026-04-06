import type { ModelResult, ModelRound } from '@/types'

/** 单侧每局最多追问次数（不含首轮模型生成）；与服务端 `battles` 路由一致。 */
export const BATTLE_MAX_REFINES_PER_MODEL = 4

/** `result.length` 为当前该模型侧轮次数（含首轮）。 */
export function battleRefineLimitReached(resultLength: number): boolean {
  return resultLength >= 1 + BATTLE_MAX_REFINES_PER_MODEL
}

export function officialMetrics(r: ModelRound) {
  const o = r.officialResult
  if (o) return { passed: o.passed, total: o.total }
  return { passed: 0, total: 0 }
}

/** 轮次 tab 上展示的通过率或简短状态；null 表示不附加文案。 */
export function roundPassRateTabLabel(r: ModelRound | undefined): string | null {
  if (!r) return null
  if (r.officialResult) {
    const { passed, total } = officialMetrics(r)
    if (total <= 0) return null
    const pct = Math.round((100 * passed) / total)
    return `${pct}%`
  }
  if (r.phase === 'awaiting_execution') return '待测'
  if (r.status === 'failed' || r.phase === 'failed') return '—'
  return null
}

export function roundTabPassLabels(model: ModelResult, latestMerged: ModelRound): (string | null)[] {
  const n = battleRoundTabCountForModel(model)
  return Array.from({ length: n }, (_, i) => {
    const r = viewRoundForTab(model, i, latestMerged)
    return roundPassRateTabLabel(r)
  })
}

/** 最新轮是否仍可能由模型流式增加分析/代码；进入 awaiting_execution 及之后则不再用该侧内容驱动主区域粘底滚动。 */
export function latestRoundLlmMayGrow(round: ModelRound | undefined): boolean {
  if (!round) return true
  const p = round.phase
  return p === 'pending' || p === 'analyzing' || p === 'coding'
}

export function currentBattleRound(r: ModelResult): ModelRound | undefined {
  const arr = r.result
  if (!arr.length) return undefined
  return arr[arr.length - 1]
}

/** Tab index view: last index uses `latestMerged` (e.g. local official overlay). */
export function viewRoundForTab(
  model: ModelResult,
  tabIndex: number,
  latestMerged: ModelRound,
): ModelRound | undefined {
  if (model.result.length === 0) return undefined
  const r = model.result[tabIndex]
  if (r === undefined) return undefined
  if (tabIndex === model.result.length - 1) return latestMerged
  return r
}

export function battleRoundTabCountForModel(m: ModelResult): number {
  return Math.max(m.result.length, 1)
}

export function roundHasAnalysisContent(r: ModelRound | undefined): boolean {
  if (!r) return false
  return (
    r.phase === 'analyzing' ||
    r.phase === 'coding' ||
    r.phase === 'awaiting_execution' ||
    r.phase === 'completed' ||
    Boolean(r.thought?.trim())
  )
}

export function roundShowsCodePhase(r: ModelRound | undefined): boolean {
  if (!r) return false
  const p = r.phase ?? 'pending'
  return (
    p !== 'pending' &&
    p !== 'analyzing' &&
    !(p === 'failed' && !String(r.code ?? '').trim())
  )
}

export function roundShowsOfficialPhase(r: ModelRound | undefined): boolean {
  if (!r) return false
  const p = r.phase ?? 'pending'
  return roundShowsCodePhase(r) && p !== 'coding'
}
