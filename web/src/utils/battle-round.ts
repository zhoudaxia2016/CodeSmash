import type { ModelResult, ModelRound } from '@/types'

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
