import type { Client } from '@libsql/client'
import { getLibsqlClient } from './client.ts'
import { seedProblemsIfEmpty } from './problemsRepo.ts'

/** Older DBs may still have difficulty; UGC 场景用 tags 表达即可（SQLite 3.35+）。 */
async function migrateDropProblemDifficulty(client: Client): Promise<void> {
  try {
    const res = await client.execute({ sql: 'PRAGMA table_info(problems)', args: [] })
    const has = res.rows.some(
      (row) => String((row as Record<string, unknown>).name) === 'difficulty',
    )
    if (!has) return
    await client.execute({ sql: 'ALTER TABLE problems DROP COLUMN difficulty', args: [] })
    console.log('[db] migration: dropped problems.difficulty')
  } catch (e) {
    console.warn(
      '[db] migration: could not drop problems.difficulty (delete server/data/codesmesh.db if stuck)',
      e,
    )
  }
}

/** Legacy `problem_test_cases.enabled` removed — all rows participate in grading. */
async function migrateDropTestCaseEnabled(client: Client): Promise<void> {
  try {
    const res = await client.execute({ sql: 'PRAGMA table_info(problem_test_cases)', args: [] })
    const has = res.rows.some(
      (row) => String((row as Record<string, unknown>).name) === 'enabled',
    )
    if (!has) return
    await client.execute({ sql: 'ALTER TABLE problem_test_cases DROP COLUMN enabled', args: [] })
    console.log('[db] migration: dropped problem_test_cases.enabled')
  } catch (e) {
    console.warn(
      '[db] migration: could not drop problem_test_cases.enabled (delete server/data/codesmesh.db if stuck)',
      e,
    )
  }
}

/** `output_text` → `output_json` (structured delta log); existing DBs get new column via ALTER. */
async function migrateLlmCallLogsOutputJson(client: Client): Promise<void> {
  try {
    const res = await client.execute({ sql: 'PRAGMA table_info(llm_call_logs)', args: [] })
    const names = new Set(
      res.rows.map((row) => String((row as Record<string, unknown>).name)),
    )
    if (names.has('output_json')) return
    await client.execute({
      sql: 'ALTER TABLE llm_call_logs ADD COLUMN output_json TEXT',
      args: [],
    })
    console.log('[db] migration: added llm_call_logs.output_json')
  } catch (e) {
    console.warn('[db] migration: llm_call_logs.output_json failed', e)
  }
}

/** Legacy `output_text` removed — logs use `output_json` only. */
async function migrateLlmCallLogsDropOutputText(client: Client): Promise<void> {
  try {
    const res = await client.execute({ sql: 'PRAGMA table_info(llm_call_logs)', args: [] })
    const names = new Set(
      res.rows.map((row) => String((row as Record<string, unknown>).name)),
    )
    if (!names.has('output_text')) return
    await client.execute({ sql: 'ALTER TABLE llm_call_logs DROP COLUMN output_text', args: [] })
    console.log('[db] migration: dropped llm_call_logs.output_text')
  } catch (e) {
    console.warn('[db] migration: llm_call_logs.output_text drop failed', e)
  }
}

/** Drop unused `source` / `sort_order`; list order uses SQLite rowid (insertion order). */
async function migrateStripTestCaseSourceAndSort(client: Client): Promise<void> {
  try {
    await client.execute({
      sql: 'DROP INDEX IF EXISTS idx_problem_test_cases_problem',
      args: [],
    })
    const pragma = () =>
      client.execute({ sql: 'PRAGMA table_info(problem_test_cases)', args: [] })
    let res = await pragma()
    let names = new Set(
      res.rows.map((row) => String((row as Record<string, unknown>).name)),
    )
    if (names.has('source')) {
      await client.execute({ sql: 'ALTER TABLE problem_test_cases DROP COLUMN source', args: [] })
      console.log('[db] migration: dropped problem_test_cases.source')
      res = await pragma()
      names = new Set(res.rows.map((row) => String((row as Record<string, unknown>).name)))
    }
    if (names.has('sort_order')) {
      await client.execute({ sql: 'ALTER TABLE problem_test_cases DROP COLUMN sort_order', args: [] })
      console.log('[db] migration: dropped problem_test_cases.sort_order')
    }
    await client.execute({
      sql: `CREATE INDEX IF NOT EXISTS idx_problem_test_cases_problem
  ON problem_test_cases (problem_id)`,
      args: [],
    })
  } catch (e) {
    console.warn(
      '[db] migration: strip test case source/sort_order failed (delete server/data/codesmesh.db if stuck)',
      e,
    )
  }
}

/** Creates tables when the server starts. */
export async function initDb(): Promise<void> {
  await Deno.mkdir(new URL('../../data/', import.meta.url), { recursive: true }).catch(() => {})

  const client = getLibsqlClient()

  await client.batch(
    [
      {
        sql: `CREATE TABLE IF NOT EXISTS llm_call_logs (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  completed_at TEXT NOT NULL,
  source TEXT NOT NULL,
  source_id TEXT,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  messages TEXT NOT NULL,
  output_json TEXT,
  error TEXT,
  duration_ms INTEGER NOT NULL
)`,
        args: [],
      },
      {
        sql: `CREATE INDEX IF NOT EXISTS idx_llm_call_logs_created_at
  ON llm_call_logs (created_at DESC)`,
        args: [],
      },
      {
        sql: `CREATE INDEX IF NOT EXISTS idx_llm_call_logs_source
  ON llm_call_logs (source, created_at DESC)`,
        args: [],
      },
      {
        sql: `CREATE INDEX IF NOT EXISTS idx_llm_call_logs_source_id
  ON llm_call_logs (source_id) WHERE source_id IS NOT NULL`,
        args: [],
      },
      {
        sql: `CREATE TABLE IF NOT EXISTS problems (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  tags_json TEXT NOT NULL DEFAULT '[]',
  entry_point TEXT NOT NULL,
  function_signature TEXT NOT NULL,
  grading_mode TEXT NOT NULL DEFAULT 'expected',
  verify_source TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
)`,
        args: [],
      },
      {
        sql: `CREATE TABLE IF NOT EXISTS problem_test_cases (
  id TEXT PRIMARY KEY,
  problem_id TEXT NOT NULL,
  data_json TEXT NOT NULL,
  ans_json TEXT,
  FOREIGN KEY (problem_id) REFERENCES problems(id) ON DELETE CASCADE
)`,
        args: [],
      },
      {
        sql: `CREATE INDEX IF NOT EXISTS idx_problem_test_cases_problem
  ON problem_test_cases (problem_id)`,
        args: [],
      },
    ],
    'write',
  )

  await migrateDropProblemDifficulty(client)
  await migrateDropTestCaseEnabled(client)
  await migrateStripTestCaseSourceAndSort(client)
  await migrateLlmCallLogsOutputJson(client)
  await migrateLlmCallLogsDropOutputText(client)

  await seedProblemsIfEmpty(client)

  console.log('[db] schema ready')
}
