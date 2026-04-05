import type { Client } from '@libsql/client'

export type LlmCallSource =
  | 'battle_analysis'
  | 'battle_code'
  | 'llm_try_analysis'
  | 'llm_try_code'
  | 'test_case_generate'
  | 'problem_authoring'
  | 'other'

/**
 * Merged model output for one request. String fields concatenate all SSE deltas (or one non-stream message).
 * `reasoning_details` is the concatenation of every `reasoning_details[].text` in order.
 */
export type LlmCallOutputJson = {
  mode: 'stream' | 'complete'
  reasoning_content?: string
  reasoning_details?: string
  thinking?: string
  content?: string
  truncated?: boolean
}

export type LlmCallLogRow = {
  id: string
  created_at: string
  completed_at: string
  source: LlmCallSource
  source_id: string | null
  provider: 'minimax' | 'deepseek'
  model: string
  messages: string
  output_json: string | null
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

/** Fit merged LLM output JSON under DB size cap by shortening string fields. */
export function serializeLlmOutputJsonForDb(output: LlmCallOutputJson, maxChars: number): string {
  const cut = (s: string, maxLen: number): string =>
    s.length <= maxLen ? s : s.slice(0, Math.max(0, maxLen - 24)) + '\n…[truncated]'

  const fields = ['content', 'reasoning_content', 'reasoning_details', 'thinking'] as const
  const clone = (): LlmCallOutputJson => ({
    mode: output.mode,
    ...(output.reasoning_content != null ? { reasoning_content: output.reasoning_content } : {}),
    ...(output.reasoning_details != null ? { reasoning_details: output.reasoning_details } : {}),
    ...(output.thinking != null ? { thinking: output.thinking } : {}),
    ...(output.content != null ? { content: output.content } : {}),
  })

  let payload = clone()
  const rec = () => payload as Record<string, unknown>
  let fieldShrink = 1
  for (let guard = 0; guard < 10_000; guard++) {
    const s = JSON.stringify(payload)
    if (s.length <= maxChars) return s

    const maxField = Math.max(64, Math.floor((maxChars / 4) * fieldShrink))
    fieldShrink *= 0.85
    payload.truncated = true
    for (const k of fields) {
      const v = payload[k]
      if (typeof v === 'string' && v.length > 0) {
        rec()[k] = cut(v, maxField)
      }
    }
  }

  return JSON.stringify({
    mode: output.mode,
    truncated: true,
    error: 'output exceeded LLM_LOG_DB_MAX_OUTPUT_CHARS',
  })
}

export async function insertLlmCallLog(client: Client, row: LlmCallLogRow): Promise<void> {
  await client.execute({
    sql: `INSERT INTO llm_call_logs (
  id, created_at, completed_at, source, source_id, provider, model, messages, output_json, error, duration_ms
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
      row.output_json,
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
