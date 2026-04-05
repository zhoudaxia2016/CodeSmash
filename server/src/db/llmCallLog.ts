import type { Client } from '@libsql/client'

export type LlmCallSource =
  | 'battle_analysis'
  | 'battle_code'
  | 'llm_try_analysis'
  | 'llm_try_code'
  | 'test_case_generate'
  | 'problem_authoring'
  | 'other'

export type LlmCallLogRow = {
  id: string
  created_at: string
  completed_at: string
  source: LlmCallSource
  source_id: string | null
  provider: 'minimax' | 'deepseek'
  model: string
  messages: string
  output_text: string | null
  error: string | null
  duration_ms: number
}

export function isLlmDbLogEnabled(): boolean {
  const v = (Deno.env.get('LLM_DB_LOG') ?? '0').toLowerCase()
  return v === '1' || v === 'true' || v === 'yes'
}

function envPositiveInt(key: string, defaultVal: number): number {
  const raw = Deno.env.get(key)
  if (raw == null || raw === '') return defaultVal
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return defaultVal
  return Math.min(Math.floor(n), 2_000_000)
}

export function maxMessagesCharsForDb(): number {
  return envPositiveInt('LLM_LOG_DB_MAX_MESSAGES_CHARS', envPositiveInt('LLM_LOG_DB_MAX_PROMPT_CHARS', 500_000))
}

export function maxOutputCharsForDb(): number {
  return envPositiveInt('LLM_LOG_DB_MAX_OUTPUT_CHARS', 500_000)
}

/** Keeps valid JSON: shortens `content` from the last message upward until under cap. */
export function serializeMessagesForDb(
  messages: ReadonlyArray<{ role: string; content: string }>,
  maxChars: number,
): string {
  const clone = messages.map((m) => ({ role: m.role, content: m.content }))
  let json = JSON.stringify(clone)
  if (json.length <= maxChars) return json

  let guard = 0
  while (json.length > maxChars && guard++ < 50_000) {
    let changed = false
    for (let i = clone.length - 1; i >= 0; i--) {
      if (clone[i].content.length <= 32) continue
      const nextLen = Math.max(32, Math.floor(clone[i].content.length * 0.8))
      clone[i].content = clone[i].content.slice(0, nextLen) + '\n…[truncated]'
      json = JSON.stringify(clone)
      changed = true
      if (json.length <= maxChars) return json
    }
    if (!changed) {
      return JSON.stringify([
        {
          role: 'system',
          content: '[messages exceeded LLM_LOG_DB_MAX_* cap; omitted]',
        },
      ])
    }
  }
  return json
}

export function truncateOutputForDb(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  return text.slice(0, Math.max(0, maxChars - 24)) + '\n…[truncated]'
}

export async function insertLlmCallLog(client: Client, row: LlmCallLogRow): Promise<void> {
  await client.execute({
    sql: `INSERT INTO llm_call_logs (
  id, created_at, completed_at, source, source_id, provider, model, messages, output_text, error, duration_ms
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      row.id,
      row.created_at,
      row.completed_at,
      row.source,
      row.source_id,
      row.provider,
      row.model,
      row.messages,
      row.output_text,
      row.error,
      row.duration_ms,
    ],
  })
}

export function scheduleInsertLlmCallLog(client: Client, row: LlmCallLogRow): void {
  void insertLlmCallLog(client, row).catch((e) => {
    console.error('[llm-db] insert failed', e)
  })
}
