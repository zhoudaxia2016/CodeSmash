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
import { loadProblemForBattle } from './problems.ts'

const battlesRouter = new Hono()

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

function getModelProvider(modelId: string): 'minimax' | 'deepseek' {
  if (modelId.startsWith('minimax')) return 'minimax'
  return 'deepseek'
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
  provider: ReturnType<typeof getModelProvider>,
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
    for await (const d of streamProblemAnalysis(provider, modelId, problemPayload(problem), problem.gradingMode, {
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

    console.log(`[battle] ${llmLog} analysis done chars=${thought.length} -> code stream`)

    patchLastRound(battleId, battle, key, modelId, { phase: 'coding', thought })
    const tCode0 = Date.now()
    let reasoningBuf = ''
    let contentBuf = ''
    for await (const part of streamProblemCode(
      provider,
      modelId,
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
  provider: ReturnType<typeof getModelProvider>,
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
    for await (const d of streamBattleRefineAnalysis(provider, modelId, historyCore, officialPlusRefine, {
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
      modelId,
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

async function runBattle(battleId: string, battle: Battle, problem: BattleProblem) {
  battle.status = 'running'
  activeBattles.set(battleId, battle)

  battle.modelAResult = null
  battle.modelBResult = null

  console.log(
    `[battle ${battleId}] runBattle: parallel LLM A=${battle.modelAId} B=${battle.modelBId} problem=${problem.id}`,
  )

  await Promise.all([
    runSide(battleId, battle, 'A', problem, battle.modelAId, getModelProvider(battle.modelAId)),
    runSide(battleId, battle, 'B', problem, battle.modelBId, getModelProvider(battle.modelBId)),
  ])

  console.log(`[battle ${battleId}] both sides finished LLM pipeline -> status awaiting_client`)

  battle.status = 'awaiting_client'
  tryFinishBattle(battle)
  activeBattles.set(battleId, battle)
}

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

  void runBattle(battleId, battle, problem)

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

  void runRefineSide(
    id,
    battle,
    body.side === 'modelA' ? 'A' : 'B',
    problem,
    modelId,
    getModelProvider(modelId),
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
