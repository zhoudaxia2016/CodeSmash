import { getLibsqlClient } from './client.ts'

/** Creates `llm_call_logs` and indexes when `LIBSQL_URL` is set. */
export async function initDb(): Promise<void> {
  const client = getLibsqlClient()
  if (!client) {
    console.log('[db] LIBSQL_URL not set, skipping schema init')
    return
  }

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
  output_text TEXT,
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
    ],
    'write',
  )

  console.log('[db] schema ready (llm_call_logs)')
}
