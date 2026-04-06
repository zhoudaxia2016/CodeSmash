import type { Client, InValue } from '@libsql/client'
import type { BattleLlmProvider } from './modelsRepo.ts'

export type LlmCallSource =
  | 'battle_analysis'
  | 'battle_code'
  | 'llm_try_analysis'
  | 'llm_try_code'
  | 'test_case_generate'
  | 'problem_authoring'
  | 'other'

/** Values for admin filters; keep in sync with `LlmCallSource`. */
export const LLM_CALL_SOURCE_VALUES: readonly LlmCallSource[] = [
  'battle_analysis',
  'battle_code',
  'llm_try_analysis',
  'llm_try_code',
  'test_case_generate',
  'problem_authoring',
  'other',
]

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
  provider: BattleLlmProvider
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

/** Max chars for derived list cells (last message / output content); full body via GET /logs/llm-call/:id. */
export const LLM_CALL_LOG_ADMIN_CELL_MAX = 800

export type AdminLlmCallLogListFilters = {
  createdFrom?: string
  createdTo?: string
  source?: string
  sourceIdContains?: string
  provider?: string
  modelContains?: string
  messagesContains?: string
  outputContains?: string
  limit: number
  offset: number
}

export type LlmCallLogListRow = {
  id: string
  created_at: string
  completed_at: string
  source: string
  source_id: string | null
  provider: string
  model: string
  messages: string
  output_json: string | null
  error: string | null
  duration_ms: number
}

function buildLlmCallLogWhere(
  f: AdminLlmCallLogListFilters,
): { sql: string; args: InValue[] } {
  const parts: string[] = ['1 = 1']
  const args: InValue[] = []

  if (f.createdFrom?.trim()) {
    parts.push('created_at >= ?')
    args.push(f.createdFrom.trim())
  }
  if (f.createdTo?.trim()) {
    parts.push('created_at <= ?')
    args.push(f.createdTo.trim())
  }
  if (f.source?.trim()) {
    parts.push('source = ?')
    args.push(f.source.trim())
  }
  if (f.sourceIdContains?.trim()) {
    parts.push('source_id IS NOT NULL AND instr(source_id, ?) > 0')
    args.push(f.sourceIdContains.trim())
  }
  if (f.provider?.trim()) {
    parts.push('provider = ?')
    args.push(f.provider.trim())
  }
  if (f.modelContains?.trim()) {
    parts.push('instr(model, ?) > 0')
    args.push(f.modelContains.trim())
  }
  if (f.messagesContains?.trim()) {
    parts.push('instr(messages, ?) > 0')
    args.push(f.messagesContains.trim())
  }
  if (f.outputContains?.trim()) {
    parts.push('output_json IS NOT NULL AND instr(output_json, ?) > 0')
    args.push(f.outputContains.trim())
  }

  return { sql: parts.join(' AND '), args }
}

export async function countLlmCallLogs(
  client: Client,
  f: AdminLlmCallLogListFilters,
): Promise<number> {
  const { sql, args } = buildLlmCallLogWhere(f)
  const res = await client.execute({
    sql: `SELECT COUNT(*) AS n FROM llm_call_logs WHERE ${sql}`,
    args,
  })
  const raw = res.rows[0] as Record<string, unknown> | undefined
  const n = raw?.n
  if (typeof n === 'bigint') return Number(n)
  if (typeof n === 'number') return n
  return 0
}

export async function listLlmCallLogsForAdmin(
  client: Client,
  f: AdminLlmCallLogListFilters,
): Promise<LlmCallLogListRow[]> {
  const { sql, args } = buildLlmCallLogWhere(f)
  const limit = Math.min(Math.max(1, f.limit), 200)
  const offset = Math.max(0, f.offset)
  const res = await client.execute({
    sql: `SELECT
  id,
  created_at,
  completed_at,
  source,
  source_id,
  provider,
  model,
  messages,
  output_json,
  error,
  duration_ms
FROM llm_call_logs
WHERE ${sql}
ORDER BY created_at DESC
LIMIT ? OFFSET ?`,
    args: [...args, limit, offset],
  })
  return res.rows as unknown as LlmCallLogListRow[]
}

/** Last chat message `content` for admin table cell; capped. */
export function deriveAdminLastMessageCell(messagesJson: string, maxChars: number): string {
  const cap = Math.max(32, Math.min(maxChars, 50_000))
  try {
    const v = JSON.parse(messagesJson) as unknown
    if (!Array.isArray(v) || v.length === 0) {
      const s = messagesJson.trim()
      return s.length <= cap ? s : `${s.slice(0, cap)}…`
    }
    const last = v[v.length - 1]
    if (last && typeof last === 'object' && last !== null && 'content' in last) {
      const c = (last as { content?: unknown }).content
      const s = typeof c === 'string' ? c : JSON.stringify(c ?? null, null, 2)
      return s.length <= cap ? s : `${s.slice(0, cap)}…`
    }
    const fallback = JSON.stringify(last)
    return fallback.length <= cap ? fallback : `${fallback.slice(0, cap)}…`
  } catch {
    const s = messagesJson.trim()
    return s.length <= cap ? s : `${s.slice(0, cap)}…`
  }
}

/** `output_json.content` for admin table cell; capped. */
export function deriveAdminOutputContentCell(
  outputJson: string | null,
  maxChars: number,
): string | null {
  if (outputJson == null || outputJson.trim() === '') return null
  const cap = Math.max(32, Math.min(maxChars, 50_000))
  try {
    const o = JSON.parse(outputJson) as Record<string, unknown>
    if (!o || typeof o !== 'object') return null
    const c = o.content
    if (typeof c !== 'string') return null
    return c.length <= cap ? c : `${c.slice(0, cap)}…`
  } catch {
    return null
  }
}

export async function getLlmCallLogById(
  client: Client,
  id: string,
): Promise<LlmCallLogRow | null> {
  const res = await client.execute({
    sql: `SELECT
  id,
  created_at,
  completed_at,
  source,
  source_id,
  provider,
  model,
  messages,
  output_json,
  error,
  duration_ms
FROM llm_call_logs
WHERE id = ?`,
    args: [id],
  })
  const row = res.rows[0] as Record<string, unknown> | undefined
  if (!row) return null
  return {
    id: String(row.id),
    created_at: String(row.created_at),
    completed_at: String(row.completed_at),
    source: row.source as LlmCallSource,
    source_id: row.source_id == null ? null : String(row.source_id),
    provider: row.provider as BattleLlmProvider,
    model: String(row.model),
    messages: String(row.messages),
    output_json: row.output_json == null ? null : String(row.output_json),
    error: row.error == null ? null : String(row.error),
    duration_ms: Number(row.duration_ms),
  }
}
