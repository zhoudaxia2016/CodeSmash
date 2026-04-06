export type ModelAgg = {
  passedSum: number
  totalSum: number
  timeSum: number
  timeN: number
  battles: number
  selfSum: number
  selfN: number
}

function bump(agg: Map<string, ModelAgg>, id: string): ModelAgg {
  let a = agg.get(id)
  if (!a) {
    a = {
      passedSum: 0,
      totalSum: 0,
      timeSum: 0,
      timeN: 0,
      battles: 0,
      selfSum: 0,
      selfN: 0,
    }
    agg.set(id, a)
  }
  return a
}

function processModelResult(agg: Map<string, ModelAgg>, mr: unknown): void {
  if (!mr || typeof mr !== 'object') return
  const modelId = (mr as { modelId?: string }).modelId
  if (typeof modelId !== 'string' || !modelId) return
  const result = (mr as { result?: unknown[] }).result
  if (!Array.isArray(result) || result.length === 0) return
  const last = result[result.length - 1]
  if (!last || typeof last !== 'object') return
  const official = (last as { officialResult?: Record<string, unknown> }).officialResult
  if (!official || typeof official !== 'object') return
  const passed = Number(official.passed)
  const total = Number(official.total)
  if (!Number.isFinite(passed) || !Number.isFinite(total) || total <= 0) return
  const a = bump(agg, modelId)
  a.passedSum += passed
  a.totalSum += total
  a.battles += 1
  const timeMs = Number(official.timeMs)
  if (Number.isFinite(timeMs) && timeMs >= 0) {
    a.timeSum += timeMs
    a.timeN += 1
  }
  const selfCases = (last as { selfTestCases?: unknown }).selfTestCases
  if (Array.isArray(selfCases) && selfCases.length > 0) {
    let ok = 0
    for (const c of selfCases) {
      if (c && typeof c === 'object' && (c as { passed?: boolean }).passed === true) ok++
    }
    a.selfSum += ok / selfCases.length
    a.selfN += 1
  }
}

/** Aggregate per-model stats from stored battle payloads (completed battles only). */
export function aggregateLeaderboardFromPayloads(
  rows: Array<{ payloadJson: string }>,
): Map<string, ModelAgg> {
  const agg = new Map<string, ModelAgg>()
  for (const row of rows) {
    let battle: unknown
    try {
      battle = JSON.parse(row.payloadJson) as unknown
    } catch {
      continue
    }
    if (!battle || typeof battle !== 'object') continue
    const status = (battle as { status?: string }).status
    if (status !== 'completed') continue
    processModelResult(agg, (battle as { modelAResult?: unknown }).modelAResult)
    processModelResult(agg, (battle as { modelBResult?: unknown }).modelBResult)
  }
  return agg
}
