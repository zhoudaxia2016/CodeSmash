import type { Client } from '@libsql/client'
import { officialTestCasesByProblem } from '../data/problemTestCases.ts'

export type GradingMode = 'expected' | 'verify'

export type ProblemRecord = {
  id: string
  title: string
  description: string
  tags: string[]
  entryPoint: string
  functionSignature: string
  gradingMode: GradingMode
  verifySource: string | null
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

export type TestCaseRecord = {
  id: string
  problemId: string
  data: unknown[]
  ans?: unknown
}

/** Trusted seed only: legacy `input` was JS arg list for main(a,b). */
function legacyInputToDataArray(input: string): unknown[] {
  const fn = new Function(`return [${input}];`)
  return fn() as unknown[]
}

function legacyExpectedToAns(expectedOutput: string): unknown {
  const t = expectedOutput.trim()
  try {
    return JSON.parse(t) as unknown
  } catch {
    if (t === 'true') return true
    if (t === 'false') return false
    return t
  }
}

const SEED_PROBLEMS: Omit<ProblemRecord, 'createdAt' | 'updatedAt' | 'createdBy'>[] = [
  {
    id: '1',
    title: '两数之和',
    description: '给定一个整数数组 nums 和一个整数 target，返回数组中和为目标值的两个数的索引。',
    tags: ['数组', '哈希表'],
    entryPoint: 'main',
    functionSignature: 'function main(nums: number[], target: number): number[]',
    gradingMode: 'expected',
    verifySource: null,
  },
  {
    id: '2',
    title: '回文数',
    description: '判断一个整数是否是回文数。回文数是指正序和倒序读都一样的整数。',
    tags: ['数学', '字符串'],
    entryPoint: 'main',
    functionSignature: 'function main(x: number): boolean',
    gradingMode: 'expected',
    verifySource: null,
  },
]

export async function seedProblemsIfEmpty(client: Client): Promise<void> {
  const row = await client.execute('SELECT COUNT(*) as c FROM problems')
  const count = Number((row.rows[0] as unknown as { c: number }).c)
  if (count > 0) return

  const now = new Date().toISOString()
  for (const p of SEED_PROBLEMS) {
    await client.execute({
      sql: `INSERT INTO problems (
        id, title, description, tags_json, entry_point, function_signature,
        grading_mode, verify_source, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        p.id,
        p.title,
        p.description,
        JSON.stringify(p.tags),
        p.entryPoint,
        p.functionSignature,
        p.gradingMode,
        p.verifySource,
        null,
        now,
        now,
      ],
    })

    const legacyCases = officialTestCasesByProblem[p.id] ?? []
    for (const tc of legacyCases) {
      const data = legacyInputToDataArray(tc.input)
      const ans = legacyExpectedToAns(tc.expectedOutput)
      await client.execute({
        sql: `INSERT INTO problem_test_cases (
          id, problem_id, data_json, ans_json
        ) VALUES (?, ?, ?, ?)`,
        args: [
          tc.id,
          p.id,
          JSON.stringify(data),
          JSON.stringify(ans),
        ],
      })
    }
  }
  console.log('[db] seeded default problems')
}

function rowToProblem(r: Record<string, unknown>): ProblemRecord {
  return {
    id: String(r.id),
    title: String(r.title),
    description: String(r.description),
    tags: JSON.parse(String(r.tags_json ?? '[]')) as string[],
    entryPoint: String(r.entry_point),
    functionSignature: String(r.function_signature),
    gradingMode: (r.grading_mode as GradingMode) || 'expected',
    verifySource: r.verify_source == null ? null : String(r.verify_source),
    createdBy: r.created_by == null || r.created_by === '' ? null : String(r.created_by),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  }
}

function rowToTestCase(r: Record<string, unknown>): TestCaseRecord {
  const ansRaw = r.ans_json
  return {
    id: String(r.id),
    problemId: String(r.problem_id),
    data: JSON.parse(String(r.data_json)) as unknown[],
    ans: ansRaw == null || ansRaw === '' ? undefined : JSON.parse(String(ansRaw)) as unknown,
  }
}

export async function listProblems(client: Client): Promise<ProblemRecord[]> {
  const res = await client.execute(
    'SELECT * FROM problems ORDER BY created_at ASC',
  )
  return res.rows.map((row) => rowToProblem(row as Record<string, unknown>))
}

export async function getProblemById(
  client: Client,
  id: string,
): Promise<ProblemRecord | null> {
  const res = await client.execute({
    sql: 'SELECT * FROM problems WHERE id = ?',
    args: [id],
  })
  if (res.rows.length === 0) return null
  return rowToProblem(res.rows[0] as Record<string, unknown>)
}

export async function listTestCasesForProblem(
  client: Client,
  problemId: string,
): Promise<TestCaseRecord[]> {
  const res = await client.execute({
    sql: 'SELECT * FROM problem_test_cases WHERE problem_id = ? ORDER BY rowid ASC',
    args: [problemId],
  })
  return res.rows.map((row) => rowToTestCase(row as Record<string, unknown>))
}

export type CreateProblemInput = {
  title: string
  description: string
  tags?: string[]
  entryPoint: string
  functionSignature: string
  gradingMode: GradingMode
  verifySource?: string | null
  testCases?: Array<{
    data: unknown[]
    ans?: unknown
  }>
}

export async function createProblem(
  client: Client,
  input: CreateProblemInput,
  createdByUserId: string,
): Promise<{ problem: ProblemRecord; testCases: TestCaseRecord[] }> {
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  const tags = input.tags ?? []
  const gradingMode = input.gradingMode
  const verifySource =
    gradingMode === 'verify' ? (input.verifySource?.trim() || null) : null

  await client.execute({
    sql: `INSERT INTO problems (
      id, title, description, tags_json, entry_point, function_signature,
      grading_mode, verify_source, created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      input.title,
      input.description,
      JSON.stringify(tags),
      input.entryPoint.trim(),
      input.functionSignature.trim(),
      gradingMode,
      verifySource,
      createdByUserId,
      now,
      now,
    ],
  })

  const tcs: TestCaseRecord[] = []
  const rawCases = input.testCases ?? []
  for (const tc of rawCases) {
    const tcId = crypto.randomUUID()
    const ansJson =
      gradingMode === 'expected' && tc.ans !== undefined
        ? JSON.stringify(tc.ans)
        : null
    await client.execute({
      sql: `INSERT INTO problem_test_cases (
        id, problem_id, data_json, ans_json
      ) VALUES (?, ?, ?, ?)`,
      args: [
        tcId,
        id,
        JSON.stringify(tc.data),
        ansJson,
      ],
    })
    tcs.push({
      id: tcId,
      problemId: id,
      data: tc.data,
      ans: tc.ans,
    })
  }

  const problem = (await getProblemById(client, id))!
  return { problem, testCases: tcs }
}

export async function updateProblem(
  client: Client,
  id: string,
  patch: Partial<
    Pick<
      CreateProblemInput,
      | 'title'
      | 'description'
      | 'tags'
      | 'entryPoint'
      | 'functionSignature'
      | 'gradingMode'
      | 'verifySource'
    >
  >,
): Promise<ProblemRecord | null> {
  const cur = await getProblemById(client, id)
  if (!cur) return null
  const gradingMode = patch.gradingMode ?? cur.gradingMode
  let verifySource = cur.verifySource
  if (gradingMode === 'expected') {
    verifySource = null
  } else if (patch.verifySource !== undefined) {
    verifySource = patch.verifySource?.trim() || null
  }

  const next: ProblemRecord = {
    ...cur,
    title: patch.title ?? cur.title,
    description: patch.description ?? cur.description,
    tags: patch.tags ?? cur.tags,
    entryPoint: patch.entryPoint ?? cur.entryPoint,
    functionSignature: patch.functionSignature ?? cur.functionSignature,
    gradingMode,
    verifySource,
  }

  const now = new Date().toISOString()
  await client.execute({
    sql: `UPDATE problems SET
      title = ?, description = ?, tags_json = ?,
      entry_point = ?, function_signature = ?, grading_mode = ?, verify_source = ?,
      updated_at = ?
    WHERE id = ?`,
    args: [
      next.title,
      next.description,
      JSON.stringify(next.tags),
      next.entryPoint,
      next.functionSignature,
      next.gradingMode,
      next.verifySource,
      now,
      id,
    ],
  })
  return (await getProblemById(client, id))!
}

export async function deleteProblem(client: Client, id: string): Promise<boolean> {
  const res = await client.execute({ sql: 'DELETE FROM problems WHERE id = ?', args: [id] })
  return (res.rowsAffected ?? 0) > 0
}

export async function createTestCase(
  client: Client,
  problemId: string,
  body: { data: unknown[]; ans?: unknown },
): Promise<TestCaseRecord | null> {
  const p = await getProblemById(client, problemId)
  if (!p) return null
  const tcId = crypto.randomUUID()
  const ansJson =
    p.gradingMode === 'expected' && body.ans !== undefined
      ? JSON.stringify(body.ans)
      : null
  await client.execute({
    sql: `INSERT INTO problem_test_cases (
      id, problem_id, data_json, ans_json
    ) VALUES (?, ?, ?, ?)`,
    args: [
      tcId,
      problemId,
      JSON.stringify(body.data),
      ansJson,
    ],
  })
  const res = await client.execute({
    sql: 'SELECT * FROM problem_test_cases WHERE id = ?',
    args: [tcId],
  })
  return rowToTestCase(res.rows[0] as Record<string, unknown>)
}

export async function updateTestCase(
  client: Client,
  problemId: string,
  testCaseId: string,
  patch: Partial<{ data: unknown[]; ans: unknown }>,
): Promise<TestCaseRecord | null> {
  const res = await client.execute({
    sql: 'SELECT * FROM problem_test_cases WHERE id = ? AND problem_id = ?',
    args: [testCaseId, problemId],
  })
  if (res.rows.length === 0) return null
  const cur = rowToTestCase(res.rows[0] as Record<string, unknown>)
  const p = await getProblemById(client, problemId)
  if (!p) return null

  const data = patch.data ?? cur.data
  let ans = patch.ans !== undefined ? patch.ans : cur.ans
  const ansJson =
    p.gradingMode === 'expected' && ans !== undefined ? JSON.stringify(ans) : null

  await client.execute({
    sql: `UPDATE problem_test_cases SET
      data_json = ?, ans_json = ?
    WHERE id = ? AND problem_id = ?`,
    args: [JSON.stringify(data), ansJson, testCaseId, problemId],
  })

  const out = await client.execute({
    sql: 'SELECT * FROM problem_test_cases WHERE id = ?',
    args: [testCaseId],
  })
  return rowToTestCase(out.rows[0] as Record<string, unknown>)
}

export async function deleteTestCase(
  client: Client,
  problemId: string,
  testCaseId: string,
): Promise<boolean> {
  const res = await client.execute({
    sql: 'DELETE FROM problem_test_cases WHERE id = ? AND problem_id = ?',
    args: [testCaseId, problemId],
  })
  return (res.rowsAffected ?? 0) > 0
}
