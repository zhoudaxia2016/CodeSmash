import { Hono } from 'hono'
import { getLibsqlClient } from '../db/client.ts'
import {
  createProblem,
  createTestCase,
  deleteProblem,
  deleteTestCase,
  getProblemById,
  listProblems,
  listTestCasesForProblem,
  updateProblem,
  updateTestCase,
  type CreateProblemInput,
  type GradingMode,
  type ProblemRecord,
  type TestCaseRecord,
} from '../db/problemsRepo.ts'
import { validateEntryPointAgainstSignature } from '../lib/entryPointValidation.ts'
import { generateProblemAuthoring } from '../lib/llm.ts'

const problemsRouter = new Hono()

function modelProviderFromModelId(modelId: string): 'minimax' | 'deepseek' {
  if (modelId.startsWith('minimax')) return 'minimax'
  return 'deepseek'
}

function problemToJson(p: ProblemRecord) {
  return {
    id: p.id,
    title: p.title,
    description: p.description,
    tags: p.tags,
    entryPoint: p.entryPoint,
    functionSignature: p.functionSignature,
    gradingMode: p.gradingMode,
    verifySource: p.verifySource,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  }
}

function testCaseToJson(tc: TestCaseRecord, gradingMode: GradingMode) {
  const input = JSON.stringify(tc.data)
  const expectedOutput =
    gradingMode === 'expected' && tc.ans !== undefined ? JSON.stringify(tc.ans) : ''
  return {
    id: tc.id,
    problemId: tc.problemId,
    data: tc.data,
    ans: tc.ans,
    input,
    expectedOutput,
  }
}

/** Exported for battles route. */
export async function loadProblemForBattle(id: string): Promise<ProblemRecord | null> {
  const client = getLibsqlClient()
  return getProblemById(client, id)
}

problemsRouter.post('/authoring', async (c) => {
  const body = await c.req.json() as {
    title?: string
    functionSignature?: string
    testCasesData?: unknown[][]
    description?: string
    tags?: string[]
    modelId?: string
  }

  if (!body.description?.trim() && !body.title?.trim()) {
    return c.json({
      error: 'description or title required',
      message: '请至少填写题目描述或标题后再使用大模型辅助',
    }, 400)
  }
  const testCasesData = Array.isArray(body.testCasesData) ? body.testCasesData : []
  for (const row of testCasesData) {
    if (!Array.isArray(row)) {
      return c.json({
        error: 'testCasesData must be an array of arrays',
        message: 'testCasesData 须为二维数组',
      }, 400)
    }
  }

  const modelId = body.modelId?.trim() || 'deepseek-chat'
  const provider = modelProviderFromModelId(modelId)

  try {
    const parsed = await generateProblemAuthoring(
      provider,
      modelId,
      {
        title: body.title?.trim() || undefined,
        description: body.description?.trim() || undefined,
        functionSignature: body.functionSignature?.trim() || undefined,
        testCasesData: testCasesData as unknown[][],
        tags: body.tags,
      },
      { source: 'problem_authoring', sourceId: null },
    )
    return c.json(parsed)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Authoring failed'
    console.error('[problems] authoring failed', e)
    return c.json({ error: msg, message: msg }, 502)
  }
})

problemsRouter.get('/', async (c) => {
  const client = getLibsqlClient()
  const problems = await listProblems(client)
  return c.json({ problems: problems.map(problemToJson) })
})

problemsRouter.get('/:id', async (c) => {
  const id = c.req.param('id')
  const client = getLibsqlClient()
  const problem = await getProblemById(client, id)
  if (!problem) {
    return c.json({ error: 'Problem not found' }, 404)
  }
  const rows = await listTestCasesForProblem(client, id)
  const testCases = rows.map((tc) => testCaseToJson(tc, problem.gradingMode))
  return c.json({ problem: problemToJson(problem), testCases })
})

problemsRouter.post('/', async (c) => {
  const body = await c.req.json() as CreateProblemInput

  if (!body.title?.trim() || !body.description?.trim()) {
    return c.json({ error: 'title and description are required' }, 400)
  }
  if (!body.entryPoint?.trim() || !body.functionSignature?.trim()) {
    return c.json({ error: 'entryPoint and functionSignature are required' }, 400)
  }
  const gradingMode: GradingMode = body.gradingMode === 'verify' ? 'verify' : 'expected'
  if (gradingMode === 'verify' && !body.verifySource?.trim()) {
    return c.json({ error: 'verifySource is required when gradingMode is verify' }, 400)
  }

  const v = validateEntryPointAgainstSignature(body.entryPoint, body.functionSignature)
  if (!v.ok) {
    return c.json({ error: v.message }, 400)
  }

  const tcList = body.testCases ?? []
  if (gradingMode === 'expected' && tcList.length > 0) {
    for (let i = 0; i < tcList.length; i++) {
      if (tcList[i].ans === undefined) {
        return c.json({ error: `testCases[${i}].ans required when gradingMode is expected` }, 400)
      }
    }
  }

  const client = getLibsqlClient()
  try {
    const { problem, testCases } = await createProblem(client, {
      ...body,
      gradingMode,
      verifySource: gradingMode === 'verify' ? body.verifySource : null,
    })
    return c.json({
      problem: problemToJson(problem),
      testCases: testCases.map((tc) => testCaseToJson(tc, problem.gradingMode)),
    }, 201)
  } catch (e) {
    console.error('[problems] create', e)
    return c.json({ error: 'Failed to create problem' }, 500)
  }
})

problemsRouter.patch('/:id', async (c) => {
  const id = c.req.param('id')
  const patch = await c.req.json() as Partial<CreateProblemInput>
  const client = getLibsqlClient()

  if (patch.entryPoint != null && patch.functionSignature != null) {
    const v = validateEntryPointAgainstSignature(patch.entryPoint, patch.functionSignature)
    if (!v.ok) return c.json({ error: v.message }, 400)
  } else if (patch.entryPoint != null || patch.functionSignature != null) {
    const cur = await getProblemById(client, id)
    if (!cur) return c.json({ error: 'Problem not found' }, 404)
    const ep = patch.entryPoint ?? cur.entryPoint
    const sig = patch.functionSignature ?? cur.functionSignature
    const v = validateEntryPointAgainstSignature(ep, sig)
    if (!v.ok) return c.json({ error: v.message }, 400)
  }

  const updated = await updateProblem(client, id, patch)
  if (!updated) {
    return c.json({ error: 'Problem not found' }, 404)
  }
  return c.json({ problem: problemToJson(updated) })
})

problemsRouter.delete('/:id', async (c) => {
  const id = c.req.param('id')
  const client = getLibsqlClient()
  const ok = await deleteProblem(client, id)
  if (!ok) {
    return c.json({ error: 'Problem not found' }, 404)
  }
  return c.json({ success: true })
})

problemsRouter.post('/:id/test-cases', async (c) => {
  const problemId = c.req.param('id')
  const body = await c.req.json() as {
    data?: unknown[]
    ans?: unknown
  }
  if (!Array.isArray(body.data)) {
    return c.json({ error: 'data (array) is required' }, 400)
  }
  const client = getLibsqlClient()
  const p = await getProblemById(client, problemId)
  if (!p) return c.json({ error: 'Problem not found' }, 404)
  if (p.gradingMode === 'expected' && body.ans === undefined) {
    return c.json({ error: 'ans is required for expected grading mode' }, 400)
  }
  const row = await createTestCase(client, problemId, {
    data: body.data,
    ans: body.ans,
  })
  return c.json({ testCase: row ? testCaseToJson(row, p.gradingMode) : null }, 201)
})

problemsRouter.patch('/:id/test-cases/:tcId', async (c) => {
  const problemId = c.req.param('id')
  const tcId = c.req.param('tcId')
  const patch = await c.req.json() as {
    data?: unknown[]
    ans?: unknown
  }
  const client = getLibsqlClient()
  const p = await getProblemById(client, problemId)
  if (!p) return c.json({ error: 'Problem not found' }, 404)
  const row = await updateTestCase(client, problemId, tcId, patch)
  if (!row) return c.json({ error: 'Test case not found' }, 404)
  return c.json({ testCase: testCaseToJson(row, p.gradingMode) })
})

problemsRouter.delete('/:id/test-cases/:tcId', async (c) => {
  const problemId = c.req.param('id')
  const tcId = c.req.param('tcId')
  const client = getLibsqlClient()
  const ok = await deleteTestCase(client, problemId, tcId)
  if (!ok) return c.json({ error: 'Test case not found' }, 404)
  return c.json({ success: true })
})

problemsRouter.post('/:id/test-cases/generate', async (c) => {
  return c.json({ error: 'Not implemented' }, 501)
})

export { problemsRouter }
