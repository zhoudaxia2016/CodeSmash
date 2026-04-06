import { Hono } from 'hono'
import type { ProblemRecord } from '../db/problemsRepo.ts'
import {
  buildBattleClosedRoundsHistoryMessages,
  buildOfficialPlusRefineUserMessage,
  finalizeRunnableFromCodeOnly,
  streamBattleRefineAnalysis,
  streamBattleRefineCode,
  streamProblemAnalysis,
  streamProblemCode,
} from '../lib/llm.ts'
import {
  mergeReasoningAndXmlCodingThought,
  sanitizeModelThoughtMarkdown,
  splitThinkingFromModelCode,
  THINKING_OPEN_TAG_RE,
} from '../lib/codePhaseSplit.ts'
import { getLibsqlClient } from '../db/client.ts'
import { getBattleResultPayloadRowForUser } from '../db/battleResultsRepo.ts'
import { getBattleLlmConfig, type BattleLlmProvider } from '../db/modelsRepo.ts'
import type { SessionUser } from '../db/userSessionsRepo.ts'
import { getSessionUser, requireAuth } from '../middleware/requireAuth.ts'
import { loadProblemForBattle } from './problems.ts'

const battlesRouter = new Hono<{ Variables: { user?: SessionUser } }>()

export type BattlePhase =
  | 'pending'
  | 'analyzing'
  | 'coding'
  | 'awaiting_execution'
  | 'failed'
  | 'completed'

type OfficialDetail = {
  testCaseId: string
  input: string
  expectedOutput: string
  actualOutput: string
  passed: boolean
  timeMs?: number
}

type BattleRound = {
  /** 追问开启该轮时的用户补充原文（首轮无）。用于 LLM 多轮 messages 回放。 */
  refineUserMessage?: string
  thought: string
  codingThought: string
  code: string
  selfTestCases: { input: string; expectedOutput: string }[]
  selfTestConclusion: string
  officialResult?: {
    passed: number
    total: number
    timeMs: number
    details?: OfficialDetail[]
  }
  timeMs: number
  analysisTimeMs?: number
  codingTimeMs?: number
  phase: BattlePhase
  status: 'running' | 'completed' | 'failed'
  error?: string
}

/** Per-model: only `modelId` + `result[]` (last element is the current round). */
type BattleResult = {
  modelId: string
  result: BattleRound[]
}

type Battle = {
  id: string
  problemId: string
  modelAId: string
  modelBId: string
  status: 'pending' | 'running' | 'awaiting_client' | 'completed' | 'failed'
  modelAResult: BattleResult | null
  modelBResult: BattleResult | null
  createdAt: string
  completedAt: string | null
}

const activeBattles = new Map<string, Battle>()

/** 从内存中移除对战（例如用户已删除云端存档后，避免仍命中旧会话）。 */
export function evictActiveBattle(battleId: string): void {
  activeBattles.delete(battleId)
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null
}

function normalizeStoredPhase(phase: string): BattlePhase {
  if (phase === 'running_tests') return 'awaiting_execution'
  if (
    phase === 'pending' ||
    phase === 'analyzing' ||
    phase === 'coding' ||
    phase === 'awaiting_execution' ||
    phase === 'failed' ||
    phase === 'completed'
  ) {
    return phase
  }
  return 'completed'
}

function normalizeStoredRoundStatus(
  status: string,
  phase: BattlePhase,
): 'running' | 'completed' | 'failed' {
  if (status === 'failed' || status === 'error' || status === 'timeout') return 'failed'
  if (phase === 'failed') return 'failed'
  if (phase === 'completed' && (status === 'completed' || status === 'running')) return 'completed'
  if (status === 'completed' && phase === 'completed') return 'completed'
  return 'running'
}

function mapOfficialDetail(d: Record<string, unknown>): OfficialDetail {
  return {
    testCaseId: String(d.testCaseId ?? ''),
    input: String(d.input ?? ''),
    expectedOutput: String(d.expectedOutput ?? ''),
    actualOutput: String(d.actualOutput ?? ''),
    passed: Boolean(d.passed),
    timeMs: typeof d.timeMs === 'number' ? d.timeMs : undefined,
  }
}

function mapStoredRoundToBattleRound(x: unknown): BattleRound | null {
  if (!isRecord(x)) return null
  const phase = normalizeStoredPhase(String(x.phase ?? 'completed'))
  const status = normalizeStoredRoundStatus(String(x.status ?? 'completed'), phase)
  const st = Array.isArray(x.selfTestCases) ? x.selfTestCases : []
  const selfTestCases = st.map((item) => {
    if (!isRecord(item)) return { input: '', expectedOutput: '' }
    return {
      input: String(item.input ?? ''),
      expectedOutput: String(item.expectedOutput ?? ''),
    }
  })
  let officialResult: BattleRound['officialResult']
  if (isRecord(x.officialResult)) {
    const o = x.officialResult
    const detailsRaw = o.details
    const details = Array.isArray(detailsRaw)
      ? detailsRaw.map((d) => (isRecord(d) ? mapOfficialDetail(d) : null)).filter((d): d is OfficialDetail => d != null)
      : undefined
    officialResult = {
      passed: Number(o.passed ?? 0),
      total: Number(o.total ?? 0),
      timeMs: Number(o.timeMs ?? 0),
      details,
    }
  }
  return {
    refineUserMessage: typeof x.refineUserMessage === 'string' ? x.refineUserMessage : undefined,
    thought: String(x.thought ?? ''),
    codingThought: String(x.codingThought ?? ''),
    code: String(x.code ?? ''),
    selfTestCases,
    selfTestConclusion: String(x.selfTestConclusion ?? ''),
    officialResult,
    timeMs: Number(x.timeMs ?? 0),
    analysisTimeMs: typeof x.analysisTimeMs === 'number' ? x.analysisTimeMs : undefined,
    codingTimeMs: typeof x.codingTimeMs === 'number' ? x.codingTimeMs : undefined,
    phase,
    status,
    error: typeof x.error === 'string' ? x.error : undefined,
  }
}

function mapStoredModelResult(x: unknown): BattleResult | null {
  if (!isRecord(x)) return null
  const modelId = x.modelId
  const result = x.result
  if (typeof modelId !== 'string' || !Array.isArray(result)) return null
  const rounds: BattleRound[] = []
  for (const r of result) {
    const br = mapStoredRoundToBattleRound(r)
    if (br) rounds.push(br)
  }
  if (rounds.length === 0) return null
  return { modelId, result: rounds }
}

function mapStoredBattleStatus(s: string): Battle['status'] {
  if (s === 'completed' || s === 'partial') return 'completed'
  if (s === 'failed') return 'failed'
  if (s === 'awaiting_client') return 'awaiting_client'
  if (s === 'pending') return 'pending'
  return 'running'
}

/** Rehydrate client battle_results JSON into in-memory Battle for refine / official. */
function battleSessionPayloadToBattle(json: unknown): Battle | null {
  if (!isRecord(json)) return null
  const id = json.id
  const problemId = json.problemId
  if (typeof id !== 'string' || typeof problemId !== 'string') return null
  const modelAId = json.modelAId
  const modelBId = json.modelBId
  if (typeof modelAId !== 'string' || typeof modelBId !== 'string') return null
  const modelAResult = mapStoredModelResult(json.modelAResult)
  const modelBResult = mapStoredModelResult(json.modelBResult)
  if (!modelAResult || !modelBResult) return null
  const status = mapStoredBattleStatus(String(json.status ?? 'completed'))
  return {
    id,
    problemId,
    modelAId,
    modelBId,
    status,
    modelAResult,
    modelBResult,
    createdAt: typeof json.createdAt === 'string' ? json.createdAt : new Date().toISOString(),
    completedAt: json.completedAt == null ? null : String(json.completedAt),
  }
}

function problemPayload(p: ProblemRecord) {
  return {
    title: p.title,
    description: p.description,
    entryPoint: p.entryPoint,
    functionSignature: p.functionSignature,
  }
}

function emptyBattleRound(): BattleRound {
  return {
    thought: '',
    codingThought: '',
    code: '',
    selfTestCases: [],
    selfTestConclusion: '',
    timeMs: 0,
    phase: 'pending',
    status: 'running',
  }
}

function lastRound(side: BattleResult | null): BattleRound | undefined {
  const r = side?.result
  if (!r?.length) return undefined
  return r[r.length - 1]
}

function lastRoundDone(side: BattleResult | null): boolean {
  const L = lastRound(side)
  if (!L) return false
  return L.status === 'failed' || (L.officialResult != null && L.phase === 'completed')
}

function tryFinishBattle(battle: Battle) {
  const a = battle.modelAResult
  const b = battle.modelBResult
  if (!a || !b) return

  if (lastRoundDone(a) && lastRoundDone(b)) {
    battle.status = 'completed'
    battle.completedAt = new Date().toISOString()
  }
}

function patchLastRound(
  battleId: string,
  battle: Battle,
  key: 'modelAResult' | 'modelBResult',
  modelId: string,
  patch: Partial<BattleRound>,
) {
  const prev = battle[key]
  if (!prev || prev.result.length === 0) {
    battle[key] = {
      modelId,
      result: [{ ...emptyBattleRound(), ...patch }],
    }
  } else {
    const rounds = [...prev.result]
    const i = rounds.length - 1
    rounds[i] = { ...rounds[i], ...patch }
    battle[key] = { modelId, result: rounds }
  }
  activeBattles.set(battleId, battle)
}

type BattleProblem = NonNullable<Awaited<ReturnType<typeof loadProblemForBattle>>>

async function runSide(
  battleId: string,
  battle: Battle,
  side: 'A' | 'B',
  problem: BattleProblem,
  modelId: string,
  provider: BattleLlmProvider,
  model: string,
) {
  const key = side === 'A' ? 'modelAResult' : 'modelBResult'
  const llmLog = `[battle=${battleId} side=${side} model=${modelId}]`

  console.log(`[battle] ${llmLog} runSide start provider=${provider}`)

  patchLastRound(battleId, battle, key, modelId, {
    phase: 'analyzing',
    thought: '',
    codingThought: '',
    code: '',
    status: 'running',
  })

  const start = Date.now()
  let analysisTimeMs = 0
  let codingTimeMs = 0
  try {
    const tAnalysis0 = Date.now()
    let thought = ''
    for await (const d of streamProblemAnalysis(
      provider,
      model,
      problemPayload(problem),
      problem.gradingMode,
      {
        logLabel: llmLog,
        source: 'battle_analysis',
        sourceId: battleId,
      },
    )) {
      thought += d
      patchLastRound(battleId, battle, key, modelId, {
        thought: sanitizeModelThoughtMarkdown(thought),
        phase: 'analyzing',
      })
    }
    thought = sanitizeModelThoughtMarkdown(thought)
    analysisTimeMs = Date.now() - tAnalysis0

    console.log(`[battle] ${llmLog} analysis done chars=${thought.length} -> code stream`)

    patchLastRound(battleId, battle, key, modelId, { phase: 'coding', thought })
    const tCode0 = Date.now()
    let reasoningBuf = ''
    let contentBuf = ''
    for await (const part of streamProblemCode(
      provider,
      model,
      problemPayload(problem),
      problem.gradingMode,
      thought,
      {
        logLabel: llmLog,
        source: 'battle_code',
        sourceId: battleId,
      },
    )) {
      if (part.kind === 'reasoning') reasoningBuf += part.text
      else contentBuf += part.text
      THINKING_OPEN_TAG_RE.lastIndex = 0
      const sawRedactedOpen = THINKING_OPEN_TAG_RE.test(contentBuf)
      if (sawRedactedOpen) {
        patchLastRound(battleId, battle, key, modelId, {
          codingThought: mergeReasoningAndXmlCodingThought(reasoningBuf, contentBuf.trim()),
          code: '',
          phase: 'coding',
        })
      } else {
        patchLastRound(battleId, battle, key, modelId, {
          codingThought: mergeReasoningAndXmlCodingThought(reasoningBuf, ''),
          code: contentBuf.trim(),
          phase: 'coding',
        })
      }
    }
    codingTimeMs = Date.now() - tCode0

    const { thinking: finalXmlThink, code: finalCodeOnly } = splitThinkingFromModelCode(contentBuf)
    const finalCodingThought = mergeReasoningAndXmlCodingThought(reasoningBuf, finalXmlThink)
    const runnable = finalizeRunnableFromCodeOnly(finalCodeOnly)
    const modelOutputMs = analysisTimeMs + codingTimeMs
    patchLastRound(battleId, battle, key, modelId, {
      phase: 'awaiting_execution',
      thought,
      codingThought: finalCodingThought,
      code: runnable,
      analysisTimeMs,
      codingTimeMs,
      timeMs: modelOutputMs,
    })
    console.log(
      `[battle] ${llmLog} done awaiting_execution codeChars=${runnable.length} analysisMs=${analysisTimeMs} codingMs=${codingTimeMs} modelOutputMs=${modelOutputMs}`,
    )
  } catch (err) {
    console.error(`[battle] ${llmLog} FAILED`, err)
    patchLastRound(battleId, battle, key, modelId, {
      status: 'failed',
      phase: 'failed',
      error: err instanceof Error ? err.message : 'Unknown error',
      analysisTimeMs: analysisTimeMs || undefined,
      codingTimeMs: codingTimeMs || undefined,
      timeMs: Date.now() - start,
    })
  }
}

async function runRefineSide(
  battleId: string,
  battle: Battle,
  side: 'A' | 'B',
  problem: BattleProblem,
  modelId: string,
  provider: BattleLlmProvider,
  model: string,
  priorClosedRounds: BattleRound[],
  refineOpts: { userMessage: string; includeFailedCases: boolean },
) {
  const key = side === 'A' ? 'modelAResult' : 'modelBResult'
  const llmLog = `[battle=${battleId} side=${side} model=${modelId} refine]`
  const historyCore = buildBattleClosedRoundsHistoryMessages(
    problemPayload(problem),
    problem.gradingMode,
    priorClosedRounds,
    refineOpts.includeFailedCases,
  )
  const lastClosed = priorClosedRounds[priorClosedRounds.length - 1]
  const lastIdx = priorClosedRounds.length - 1
  const officialPlusRefine = buildOfficialPlusRefineUserMessage(
    lastIdx,
    lastClosed,
    refineOpts.includeFailedCases,
    refineOpts.userMessage,
  )

  console.log(`[battle] ${llmLog} runRefineSide start rounds=${priorClosedRounds.length}`)

  const start = Date.now()
  let analysisTimeMs = 0
  let codingTimeMs = 0
  try {
    const tAnalysis0 = Date.now()
    let thought = ''
    for await (const d of streamBattleRefineAnalysis(provider, model, historyCore, officialPlusRefine, {
      logLabel: llmLog,
      source: 'battle_analysis',
      sourceId: battleId,
    })) {
      thought += d
      patchLastRound(battleId, battle, key, modelId, {
        thought: sanitizeModelThoughtMarkdown(thought),
        phase: 'analyzing',
      })
    }
    thought = sanitizeModelThoughtMarkdown(thought)
    analysisTimeMs = Date.now() - tAnalysis0

    patchLastRound(battleId, battle, key, modelId, { phase: 'coding', thought })
    const tCode0 = Date.now()
    let reasoningBuf = ''
    let contentBuf = ''
    for await (const part of streamBattleRefineCode(
      provider,
      model,
      problemPayload(problem),
      historyCore,
      officialPlusRefine,
      thought,
      {
        logLabel: llmLog,
        source: 'battle_code',
        sourceId: battleId,
      },
    )) {
      if (part.kind === 'reasoning') reasoningBuf += part.text
      else contentBuf += part.text
      THINKING_OPEN_TAG_RE.lastIndex = 0
      const sawRedactedOpen = THINKING_OPEN_TAG_RE.test(contentBuf)
      if (sawRedactedOpen) {
        patchLastRound(battleId, battle, key, modelId, {
          codingThought: mergeReasoningAndXmlCodingThought(reasoningBuf, contentBuf.trim()),
          code: '',
          phase: 'coding',
        })
      } else {
        patchLastRound(battleId, battle, key, modelId, {
          codingThought: mergeReasoningAndXmlCodingThought(reasoningBuf, ''),
          code: contentBuf.trim(),
          phase: 'coding',
        })
      }
    }
    codingTimeMs = Date.now() - tCode0

    const { thinking: finalXmlThink, code: finalCodeOnly } = splitThinkingFromModelCode(contentBuf)
    const finalCodingThought = mergeReasoningAndXmlCodingThought(reasoningBuf, finalXmlThink)
    const runnable = finalizeRunnableFromCodeOnly(finalCodeOnly)
    const modelOutputMs = analysisTimeMs + codingTimeMs
    patchLastRound(battleId, battle, key, modelId, {
      phase: 'awaiting_execution',
      thought,
      codingThought: finalCodingThought,
      code: runnable,
      analysisTimeMs,
      codingTimeMs,
      timeMs: modelOutputMs,
    })
    console.log(
      `[battle] ${llmLog} refine done awaiting_execution codeChars=${runnable.length} analysisMs=${analysisTimeMs} codingMs=${codingTimeMs}`,
    )
  } catch (err) {
    console.error(`[battle] ${llmLog} refine FAILED`, err)
    patchLastRound(battleId, battle, key, modelId, {
      status: 'failed',
      phase: 'failed',
      error: err instanceof Error ? err.message : 'Unknown error',
      analysisTimeMs: analysisTimeMs || undefined,
      codingTimeMs: codingTimeMs || undefined,
      timeMs: Date.now() - start,
    })
  }

  battle.status = 'awaiting_client'
  tryFinishBattle(battle)
  activeBattles.set(battleId, battle)
}

async function runBattle(
  battleId: string,
  battle: Battle,
  problem: BattleProblem,
  sideA: { provider: BattleLlmProvider; model: string },
  sideB: { provider: BattleLlmProvider; model: string },
) {
  battle.status = 'running'
  activeBattles.set(battleId, battle)

  battle.modelAResult = null
  battle.modelBResult = null

  console.log(
    `[battle ${battleId}] runBattle: parallel LLM A=${battle.modelAId} B=${battle.modelBId} problem=${problem.id}`,
  )

  await Promise.all([
    runSide(battleId, battle, 'A', problem, battle.modelAId, sideA.provider, sideA.model),
    runSide(battleId, battle, 'B', problem, battle.modelBId, sideB.provider, sideB.model),
  ])

  console.log(`[battle ${battleId}] both sides finished LLM pipeline -> status awaiting_client`)

  battle.status = 'awaiting_client'
  tryFinishBattle(battle)
  activeBattles.set(battleId, battle)
}

battlesRouter.post('/resume/:id', requireAuth, async (c) => {
  const user = getSessionUser(c)
  const id = c.req.param('id')
  if (!id) return c.json({ error: 'id required' }, 400)

  const existing = activeBattles.get(id)
  if (existing) {
    return c.json({ battle: existing })
  }

  const client = getLibsqlClient()
  let row: { payloadJson: string } | null
  try {
    row = await getBattleResultPayloadRowForUser(client, id, user.id)
  } catch (e) {
    console.error('[battles] resume load', e)
    return c.json({ error: 'Failed to load stored battle' }, 500)
  }
  if (!row) {
    return c.json({ error: 'Not found' }, 404)
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(row.payloadJson) as unknown
  } catch {
    return c.json({ error: 'Invalid stored battle' }, 500)
  }

  const battle = battleSessionPayloadToBattle(parsed)
  if (!battle) {
    return c.json({ error: 'Could not restore battle from snapshot' }, 400)
  }

  activeBattles.set(id, battle)
  return c.json({ battle })
})

battlesRouter.post('/', async (c) => {
  const { problemId, modelAId, modelBId } = await c.req.json()

  if (!problemId || !modelAId || !modelBId) {
    return c.json({ error: 'problemId, modelAId, modelBId are required' }, 400)
  }

  if (modelAId === modelBId) {
    return c.json({ error: 'Must select two different models' }, 400)
  }

  const problem = await loadProblemForBattle(problemId)
  if (!problem) {
    return c.json({ error: 'Problem not found' }, 404)
  }

  const dbClient = getLibsqlClient()
  const cfgA = await getBattleLlmConfig(dbClient, modelAId)
  const cfgB = await getBattleLlmConfig(dbClient, modelBId)
  if (!cfgA || !cfgB) {
    return c.json({ error: 'Invalid or disabled model' }, 400)
  }

  const battleId = crypto.randomUUID()
  const battle: Battle = {
    id: battleId,
    problemId,
    modelAId,
    modelBId,
    status: 'running',
    modelAResult: null,
    modelBResult: null,
    createdAt: new Date().toISOString(),
    completedAt: null,
  }

  activeBattles.set(battleId, battle)

  console.log(
    `[battle ${battleId}] POST accepted problem=${problemId} modelA=${modelAId} modelB=${modelBId} -> background runBattle`,
  )

  void runBattle(battleId, battle, problem, cfgA, cfgB)

  return c.json({ battle }, 201)
})

battlesRouter.post('/:id/refine', async (c) => {
  const id = c.req.param('id')
  const battle = activeBattles.get(id)
  if (!battle) {
    return c.json({ error: 'Battle not found' }, 404)
  }

  const body = await c.req.json() as {
    side?: string
    userMessage?: string
    includeFailedCases?: boolean
  }

  if (body.side !== 'modelA' && body.side !== 'modelB') {
    return c.json({ error: 'side must be modelA or modelB' }, 400)
  }

  if (battle.status === 'running') {
    return c.json({ error: 'Battle is busy (model output in progress)' }, 409)
  }

  const key = body.side === 'modelA' ? 'modelAResult' : 'modelBResult'
  const target = battle[key]
  if (!target?.result.length) {
    return c.json({ error: 'Model result missing' }, 400)
  }

  const last = target.result[target.result.length - 1]
  if (last.phase !== 'completed' || last.officialResult == null) {
    return c.json({ error: 'Current round must be completed with official results before refine' }, 400)
  }

  const problem = await loadProblemForBattle(battle.problemId)
  if (!problem) {
    return c.json({ error: 'Problem not found' }, 404)
  }

  const priorClosedRounds = target.result.map((r) => ({ ...r }))
  const modelId = target.modelId

  const refineOpts = {
    userMessage: typeof body.userMessage === 'string' ? body.userMessage : '',
    includeFailedCases: body.includeFailedCases !== false,
  }

  target.result = [...target.result, emptyBattleRound()]
  const appended = target.result[target.result.length - 1]
  Object.assign(appended, {
    phase: 'analyzing',
    thought: '',
    codingThought: '',
    code: '',
    status: 'running',
    refineUserMessage: refineOpts.userMessage,
  })

  battle.status = 'running'
  battle.completedAt = null

  activeBattles.set(id, battle)

  const dbClient = getLibsqlClient()
  const cfg = await getBattleLlmConfig(dbClient, modelId)
  if (!cfg) {
    return c.json({ error: 'Invalid or disabled model' }, 400)
  }

  void runRefineSide(
    id,
    battle,
    body.side === 'modelA' ? 'A' : 'B',
    problem,
    modelId,
    cfg.provider,
    cfg.model,
    priorClosedRounds,
    refineOpts,
  )

  return c.json({ battle })
})

battlesRouter.post('/:id/official', async (c) => {
  const id = c.req.param('id')
  const battle = activeBattles.get(id)
  if (!battle) {
    return c.json({ error: 'Battle not found' }, 404)
  }

  const body = await c.req.json() as {
    side?: string
    officialResult?: {
      passed: number
      total: number
      timeMs: number
      details?: OfficialDetail[]
    }
  }

  if (body.side !== 'modelA' && body.side !== 'modelB') {
    return c.json({ error: 'side must be modelA or modelB' }, 400)
  }
  if (!body.officialResult || typeof body.officialResult.passed !== 'number') {
    return c.json({ error: 'officialResult with passed, total, timeMs required' }, 400)
  }

  const key = body.side === 'modelA' ? 'modelAResult' : 'modelBResult'
  const target = battle[key]
  if (!target?.result.length) {
    return c.json({ error: 'Model result missing' }, 400)
  }

  const last = target.result[target.result.length - 1]
  if (last.phase === 'completed' && last.officialResult) {
    tryFinishBattle(battle)
    activeBattles.set(id, battle)
    return c.json({ battle })
  }
  if (last.phase !== 'awaiting_execution') {
    return c.json({ error: 'Model is not awaiting execution results' }, 400)
  }

  const rounds = [...target.result]
  const i = rounds.length - 1
  rounds[i] = {
    ...rounds[i],
    officialResult: {
      passed: body.officialResult.passed,
      total: body.officialResult.total,
      timeMs: body.officialResult.timeMs,
      details: body.officialResult.details,
    },
    phase: 'completed',
    status: 'completed',
    selfTestConclusion: '',
  }
  battle[key] = { modelId: target.modelId, result: rounds }

  tryFinishBattle(battle)
  activeBattles.set(id, battle)
  return c.json({ battle })
})

battlesRouter.get('/:id', (c) => {
  const id = c.req.param('id')
  const battle = activeBattles.get(id)
  if (!battle) {
    return c.json({ error: 'Battle not found' }, 404)
  }
  return c.json({ battle })
})

battlesRouter.get('/:id/poll', (c) => {
  const id = c.req.param('id')
  const battle = activeBattles.get(id)
  if (!battle) {
    return c.json({ error: 'Battle not found' }, 404)
  }
  return c.json({ battle })
})

export { battlesRouter }
