import { Hono } from 'hono'
import { prepareRunnableJavaScript, streamProblemAnalysis, streamProblemCode } from '../lib/llm.ts'
import { sanitizeModelThoughtMarkdown, splitThinkingFromModelCode } from '../lib/codePhaseSplit.ts'
import { problems } from './problems.ts'

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

type BattleResult = {
  modelId: string
  status: 'running' | 'completed' | 'failed'
  phase: BattlePhase
  thought: string
  /** Code-phase reasoning / prose (not the runnable harness body). */
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
  /** 模型输出总耗时 = analysisTimeMs + codingTimeMs（成功时） */
  timeMs: number
  analysisTimeMs?: number
  codingTimeMs?: number
  error?: string
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

function tryFinishBattle(battle: Battle) {
  const a = battle.modelAResult
  const b = battle.modelBResult
  if (!a || !b) return

  const aDone = a.status === 'failed' || (a.officialResult != null && a.phase === 'completed')
  const bDone = b.status === 'failed' || (b.officialResult != null && b.phase === 'completed')

  if (aDone && bDone) {
    battle.status = 'completed'
    battle.completedAt = new Date().toISOString()
  }
}

function emptyResult(modelId: string): BattleResult {
  return {
    modelId,
    status: 'running',
    phase: 'pending',
    thought: '',
    codingThought: '',
    code: '',
    selfTestCases: [],
    selfTestConclusion: '',
    timeMs: 0,
  }
}

async function runSide(
  battleId: string,
  battle: Battle,
  side: 'A' | 'B',
  problem: typeof problems[0],
  modelId: string,
  provider: ReturnType<typeof getModelProvider>,
) {
  const key = side === 'A' ? 'modelAResult' : 'modelBResult'
  const llmLog = `[battle=${battleId} side=${side} model=${modelId}]`

  const merge = (partial: Partial<BattleResult>) => {
    const prev = battle[key] ?? emptyResult(modelId)
    battle[key] = { ...prev, ...partial, modelId } as BattleResult
    activeBattles.set(battleId, battle)
  }

  console.log(`[battle] ${llmLog} runSide start provider=${provider}`)

  merge({
    ...emptyResult(modelId),
    phase: 'analyzing',
    thought: '',
    codingThought: '',
    code: '',
  })

  const start = Date.now()
  let analysisTimeMs = 0
  let codingTimeMs = 0
  try {
    const tAnalysis0 = Date.now()
    let thought = ''
    for await (const d of streamProblemAnalysis(provider, modelId, problem, {
      logLabel: llmLog,
      source: 'battle_analysis',
      sourceId: battleId,
    })) {
      thought += d
      merge({ thought: sanitizeModelThoughtMarkdown(thought), phase: 'analyzing' })
    }
    thought = sanitizeModelThoughtMarkdown(thought)
    analysisTimeMs = Date.now() - tAnalysis0

    console.log(`[battle] ${llmLog} analysis done chars=${thought.length} -> code stream`)

    merge({ phase: 'coding', thought })
    const tCode0 = Date.now()
    let codeRaw = ''
    for await (const d of streamProblemCode(provider, modelId, problem, thought, {
      logLabel: llmLog,
      source: 'battle_code',
      sourceId: battleId,
    })) {
      codeRaw += d
      const { thinking } = splitThinkingFromModelCode(codeRaw)
      const runnable = prepareRunnableJavaScript(codeRaw)
      merge({ codingThought: thinking, code: runnable, phase: 'coding' })
    }
    codingTimeMs = Date.now() - tCode0

    const { thinking: finalCodingThought } = splitThinkingFromModelCode(codeRaw)
    const runnable = prepareRunnableJavaScript(codeRaw)
    const modelOutputMs = analysisTimeMs + codingTimeMs
    merge({
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
    merge({
      status: 'failed',
      phase: 'failed',
      error: err instanceof Error ? err.message : 'Unknown error',
      analysisTimeMs: analysisTimeMs || undefined,
      codingTimeMs: codingTimeMs || undefined,
      timeMs: Date.now() - start,
    })
  }
}

async function runBattle(battleId: string, battle: Battle, problem: typeof problems[0]) {
  battle.status = 'running'
  activeBattles.set(battleId, battle)

  battle.modelAResult = null
  battle.modelBResult = null

  console.log(
    `[battle ${battleId}] runBattle: parallel LLM A=${battle.modelAId} B=${battle.modelBId} problem=${problem.id}`,
  )

  await Promise.all([
    runSide(
      battleId,
      battle,
      'A',
      problem,
      battle.modelAId,
      getModelProvider(battle.modelAId),
    ),
    runSide(
      battleId,
      battle,
      'B',
      problem,
      battle.modelBId,
      getModelProvider(battle.modelBId),
    ),
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

  const problem = problems.find((p) => p.id === problemId)
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

  const target = body.side === 'modelA' ? battle.modelAResult : battle.modelBResult
  if (!target) {
    return c.json({ error: 'Model result missing' }, 400)
  }
  if (target.phase === 'completed' && target.officialResult) {
    tryFinishBattle(battle)
    activeBattles.set(id, battle)
    return c.json({ battle })
  }
  if (target.phase !== 'awaiting_execution') {
    return c.json({ error: 'Model is not awaiting execution results' }, 400)
  }

  const next: BattleResult = {
    ...target,
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

  if (body.side === 'modelA') {
    battle.modelAResult = next
  } else {
    battle.modelBResult = next
  }

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
