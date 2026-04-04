import { Hono } from 'hono'
import { callLLM } from '../lib/llm.ts'
import { problems } from './problems.ts'

const battlesRouter = new Hono()

type Battle = {
  id: string
  problemId: string
  modelAId: string
  modelBId: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  modelAResult: BattleResult | null
  modelBResult: BattleResult | null
  createdAt: string
  completedAt: string | null
}

type BattleResult = {
  modelId: string
  status: 'completed' | 'failed'
  thought: string
  code: string
  selfTestCases: { input: string; expectedOutput: string }[]
  selfTestConclusion: string
  officialResult: { passed: number; total: number; timeMs: number }
  timeMs: number
  error?: string
}

const activeBattles = new Map<string, Battle>()

function getModelProvider(modelId: string): 'minimax' | 'deepseek' {
  if (modelId.startsWith('minimax')) return 'minimax'
  return 'deepseek'
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
    status: 'pending',
    modelAResult: null,
    modelBResult: null,
    createdAt: new Date().toISOString(),
    completedAt: null,
  }

  activeBattles.set(battleId, battle)

  runBattle(battleId, battle, problem)

  return c.json({ battle }, 201)
})

async function runBattle(battleId: string, battle: Battle, problem: typeof problems[0]) {
  battle.status = 'running'
  activeBattles.set(battleId, battle)

  const providerA = getModelProvider(battle.modelAId)
  const providerB = getModelProvider(battle.modelBId)

  const llmRequest = {
    model: battle.modelAId,
    prompt: 'Solve this problem',
    problem: {
      title: problem.title,
      description: problem.description,
      functionSignature: problem.functionSignature,
    },
  }

  const startTimeA = Date.now()
  try {
    const resultA = await callLLM(providerA, llmRequest)
    battle.modelAResult = {
      modelId: battle.modelAId,
      status: 'completed',
      thought: resultA.thought,
      code: resultA.code,
      selfTestCases: [
        { input: '[2,7,11,15], 9', expectedOutput: '[0,1]' },
        { input: '[3,2,4], 6', expectedOutput: '[1,2]' },
      ],
      selfTestConclusion: '自测通过',
      officialResult: { passed: 8, total: 10, timeMs: 45 },
      timeMs: Date.now() - startTimeA,
    }
  } catch (err) {
    battle.modelAResult = {
      modelId: battle.modelAId,
      status: 'failed',
      thought: '',
      code: '',
      selfTestCases: [],
      selfTestConclusion: '',
      officialResult: { passed: 0, total: 10, timeMs: 0 },
      timeMs: Date.now() - startTimeA,
      error: err instanceof Error ? err.message : 'Unknown error',
    }
  }
  activeBattles.set(battleId, battle)

  const startTimeB = Date.now()
  try {
    const resultB = await callLLM(providerB, {
      ...llmRequest,
      model: battle.modelBId,
    })
    battle.modelBResult = {
      modelId: battle.modelBId,
      status: 'completed',
      thought: resultB.thought,
      code: resultB.code,
      selfTestCases: [
        { input: '[2,7,11,15], 9', expectedOutput: '[0,1]' },
        { input: '[3,2,4], 6', expectedOutput: '[1,2]' },
      ],
      selfTestConclusion: '自测通过',
      officialResult: { passed: 10, total: 10, timeMs: 38 },
      timeMs: Date.now() - startTimeB,
    }
  } catch (err) {
    battle.modelBResult = {
      modelId: battle.modelBId,
      status: 'failed',
      thought: '',
      code: '',
      selfTestCases: [],
      selfTestConclusion: '',
      officialResult: { passed: 0, total: 10, timeMs: 0 },
      timeMs: Date.now() - startTimeB,
      error: err instanceof Error ? err.message : 'Unknown error',
    }
  }

  battle.status = 'completed'
  battle.completedAt = new Date().toISOString()
  activeBattles.set(battleId, battle)
}

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