import { getLibsqlClient } from '../db/client.ts'
import {
  isLlmDbLogEnabled,
  maxMessagesCharsForDb,
  maxOutputCharsForDb,
  scheduleInsertLlmCallLog,
  serializeMessagesForDb,
  truncateOutputForDb,
  type LlmCallSource,
} from '../db/llmCallLog.ts'
import { tryExtractStructuredCodeString } from './modelStructuredParse.ts'
import { splitThinkingFromModelCode } from './codePhaseSplit.ts'

export type { LlmCallSource }

export type StreamLlmOptions = {
  logLabel?: string
  source: LlmCallSource
  sourceId?: string | null
}

let warnedLlmDbMissingUrl = false

export interface LLMRequest {
  model: string
  prompt: string
  problem?: {
    title: string
    description: string
    entryPoint: string
    functionSignature: string
  }
}

export interface LLMResponse {
  thought: string
  /** Code-phase reasoning / prose (not executable). */
  codingThought: string
  code: string
}

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string }

export type ProblemPayload = {
  title: string
  description: string
  /** Callable name used by the test harness (e.g. main). */
  entryPoint: string
  functionSignature: string
}

/** Set LLM_LOG_PROMPTS=0 to disable. LLM_PROMPT_LOG_MAX_CHARS caps each message body in logs (default 8000). */
function shouldLogPrompts(): boolean {
  const v = (Deno.env.get('LLM_LOG_PROMPTS') ?? '1').toLowerCase()
  return v !== '0' && v !== 'false' && v !== 'no'
}

function promptLogMaxPerMessage(): number {
  const n = Number(Deno.env.get('LLM_PROMPT_LOG_MAX_CHARS') ?? '8000')
  if (!Number.isFinite(n) || n <= 0) return 8000
  return Math.min(Math.floor(n), 500_000)
}

function logChatPrompts(tag: string, messages: ChatMessage[]) {
  if (!shouldLogPrompts()) return
  const max = promptLogMaxPerMessage()
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i]
    const raw = m.content
    const omitted = raw.length > max ? raw.length - max : 0
    const body = omitted > 0 ? `${raw.slice(0, max)}\n… [${omitted} chars omitted]` : raw
    console.log(`[llm]${tag} prompt[${i}] role=${m.role} totalChars=${raw.length}:\n${body}`)
  }
}

const PROVIDERS = {
  minimax: {
    baseUrl: Deno.env.get('MINIMAX_BASE_URL') || 'https://api.minimaxi.com/v1',
    apiKey: Deno.env.get('MINIMAX_API_KEY') || '',
  },
  deepseek: {
    baseUrl: Deno.env.get('DEEPSEEK_BASE_URL') || 'https://api.deepseek.com/v1',
    apiKey: Deno.env.get('DEEPSEEK_API_KEY') || '',
  },
} as const

function resolveApiModel(provider: 'minimax' | 'deepseek', _platformModelId: string): string {
  if (provider === 'deepseek') {
    return Deno.env.get('DEEPSEEK_MODEL') || 'deepseek-chat'
  }
  return Deno.env.get('MINIMAX_MODEL') || 'MiniMax-M2.7'
}

async function* streamChat(
  provider: 'minimax' | 'deepseek',
  platformModelId: string,
  messages: ChatMessage[],
  options: StreamLlmOptions,
): AsyncGenerator<string, void, unknown> {
  const logLabel = options.logLabel ?? ''
  const tag = logLabel ? ` ${logLabel}` : ''
  const config = PROVIDERS[provider]
  const createdAt = new Date().toISOString()
  const t0 = Date.now()

  let shouldPersist = false
  let apiModel = ''
  let streamSucceeded = false
  let outputAccum = ''
  let persistError: string | null = null

  const persistRow = () => {
    if (!shouldPersist || !isLlmDbLogEnabled()) return
    const cli = getLibsqlClient()
    if (!cli) {
      if (!warnedLlmDbMissingUrl) {
        warnedLlmDbMissingUrl = true
        console.warn('[llm-db] LLM_DB_LOG is enabled but LIBSQL_URL is unset; skipping DB writes')
      }
      return
    }
    const completedAt = new Date().toISOString()
    const messagesJson = serializeMessagesForDb(messages, maxMessagesCharsForDb())
    const output_text = streamSucceeded
      ? truncateOutputForDb(outputAccum, maxOutputCharsForDb())
      : null
    scheduleInsertLlmCallLog(cli, {
      id: crypto.randomUUID(),
      created_at: createdAt,
      completed_at: completedAt,
      source: options.source,
      source_id: options.sourceId ?? null,
      provider,
      model: apiModel,
      messages: messagesJson,
      output_text,
      error: streamSucceeded ? null : persistError,
      duration_ms: Date.now() - t0,
    })
  }

  try {
    if (!config.apiKey) {
      console.error(`[llm]${tag} abort: ${provider} API key not configured`)
      throw new Error(`${provider} API key not configured`)
    }

    apiModel = resolveApiModel(provider, platformModelId)
    shouldPersist = true

    console.log(
      `[llm]${tag} request provider=${provider} upstreamModel=${apiModel} platformModelId=${platformModelId} url=${config.baseUrl}/chat/completions`,
    )
    logChatPrompts(tag, messages)

    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: apiModel,
        messages,
        max_tokens: 4096,
        stream: true,
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      console.error(`[llm]${tag} HTTP ${response.status} body=${error.slice(0, 800)}`)
      persistError = `${provider} API error: ${response.status} - ${error.slice(0, 2000)}`
      throw new Error(`${provider} API error: ${response.status} - ${error}`)
    }

    console.log(`[llm]${tag} response OK, reading SSE stream… (+${Date.now() - t0}ms)`)

    const reader = response.body!.getReader()
    const decoder = new TextDecoder()
    let carry = ''
    let deltaChunks = 0
    let deltaChars = 0
    /** MiniMax (and similar) stream reasoning in delta.reasoning_content / reasoning_details, not in content. */
    let pendingReasoning = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      carry += decoder.decode(value, { stream: true })
      const lines = carry.split('\n')
      carry = lines.pop() ?? ''
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data:')) continue
        const data = trimmed.slice(5).trim()
        if (data === '[DONE]') continue
        try {
          const json = JSON.parse(data) as {
            choices?: Array<{ delta?: Record<string, unknown> }>
          }
          const d = json.choices?.[0]?.delta
          if (!d || typeof d !== 'object') continue

          let rp = ''
          const rc = d.reasoning_content
          if (typeof rc === 'string' && rc.length > 0) rp += rc
          const rd = d.reasoning_details
          if (Array.isArray(rd)) {
            for (const item of rd) {
              if (item && typeof item === 'object' && 'text' in item) {
                const t = (item as { text?: unknown }).text
                if (typeof t === 'string' && t.length > 0) rp += t
              }
            }
          }
          const th = d.thinking
          if (typeof th === 'string' && th.length > 0) rp += th

          if (rp) pendingReasoning += rp

          const content = d.content
          if (typeof content === 'string' && content.length > 0) {
            if (pendingReasoning.trim()) {
              const wrapped = `<redacted_thinking>${pendingReasoning.trim()}</redacted_thinking>\n`
              deltaChunks++
              deltaChars += wrapped.length
              outputAccum += wrapped
              yield wrapped
              pendingReasoning = ''
            }
            deltaChunks++
            deltaChars += content.length
            outputAccum += content
            yield content
          }
        } catch {
          // ignore partial JSON lines
        }
      }
    }

    if (pendingReasoning.trim()) {
      const wrapped = `<redacted_thinking>${pendingReasoning.trim()}</redacted_thinking>`
      deltaChunks++
      deltaChars += wrapped.length
      outputAccum += wrapped
      yield wrapped
    }

    streamSucceeded = true

    console.log(
      `[llm]${tag} stream done deltaChunks=${deltaChunks} deltaChars=${deltaChars} totalMs=${Date.now() - t0}`,
    )
  } catch (e) {
    if (persistError === null) {
      persistError = e instanceof Error ? e.message : String(e)
    }
    throw e
  } finally {
    persistRow()
  }
}

const ANALYSIS_SYSTEM = `你是算法设计专家。针对给定的编程题目，仅说明你的推理过程，内容包括：
- 拟采用的思路
- 时间与空间复杂度
- 需要注意的边界情况

严格规则：
- 不要写代码。
- 不要使用 Markdown 代码块（三个反引号）。
- 不要输出函数定义或看起来像可执行 JavaScript 的片段。
使用平实语言；短条目列表即可。`

function buildCodeSystem(entryPoint: string, functionSignature: string): string {
  return `你为自动化测试框架只输出 JavaScript。

请严格实现以下顶层声明——标识符、参数列表与返回值语义一致。签名中的类型仅为提示；请输出纯 JavaScript。

${functionSignature}

规则：
- 以上声明为唯一权威来源：不得重命名函数、不得改变参数个数或顺序。
- 测试框架会依据该声明和题目描述调用 ${entryPoint}。
- 允许少量顶层辅助函数，但已声明的函数必须与上述完全一致。
- 除非为清晰起见需要短代码块，否则不要用 Markdown 代码围栏包裹整个解法；优先输出原始顶层 JavaScript。
- 不要用一对双引号 \`"\` 或单引号 \`'\` 把整段回复（推理与代码合在一起）包成字符串字面量；不要用「整段 JSON 字符串」或转义后的源码形式输出。
- 可执行部分必须直接以源码出现：行首应是 \`function\`（或允许的顶层声明），不要在 \`function\` 前多加引号或把 \`function ${entryPoint}\` 放进字符串里。
- 使用普通顶层函数；不要 export 模块，也不要把要求的函数包在对象里。
- 只输出恰好一个完整的顶层 \`function ${entryPoint}\`（或与签名匹配的唯一声明）。不要为同一入口函数输出两份完整实现。
- 若 API 提供单独的推理通道，请在那里做规划；主消息流保持为可运行程序。`
}

export async function* streamProblemAnalysis(
  provider: 'minimax' | 'deepseek',
  platformModelId: string,
  problem: ProblemPayload,
  options: StreamLlmOptions,
): AsyncGenerator<string, void, unknown> {
  const user = `题目：${problem.title}

题目描述：
${problem.description}

要求的函数签名：
${problem.functionSignature}

请说明你打算如何求解本题。注意：不要写代码。`

  const logLabel = options.logLabel
    ? `${options.logLabel} analysis`
    : 'analysis'
  yield* streamChat(provider, platformModelId, [
    { role: 'system', content: ANALYSIS_SYSTEM },
    { role: 'user', content: user },
  ], { ...options, logLabel })
}

export async function* streamProblemCode(
  provider: 'minimax' | 'deepseek',
  platformModelId: string,
  problem: ProblemPayload,
  analysis: string,
  options: StreamLlmOptions,
): AsyncGenerator<string, void, unknown> {
  const problemUser = `题目：${problem.title}

题目描述：
${problem.description}

要求的函数签名（请严格按此声明实现）：
${problem.functionSignature}`

  const assistantAnalysis = analysis.trim() || '（上一步未产生分析文本。）'

  const codeUser =
    `请写出 JavaScript 实现：仅一个符合签名的 ${problem.entryPoint}，不要重复实现。` +
    `基于你上文的分析完成实现；不要在输出中重复大段说明文字。` +
    `直接输出可执行源码，不要在整段外加双引号或单引号，不要用字符串包裹 function。`

  const logLabel = options.logLabel ? `${options.logLabel} code` : 'code'
  yield* streamChat(provider, platformModelId, [
    { role: 'system', content: buildCodeSystem(problem.entryPoint, problem.functionSignature) },
    { role: 'user', content: problemUser },
    { role: 'assistant', content: assistantAnalysis },
    { role: 'user', content: codeUser },
  ], { ...options, logLabel })
}

/**
 * Interleaved reasoning blocks (OpenAI-compatible stream often concatenates these into assistant text).
 * Stripped only when preparing runnable JS; battle snapshots keep the raw model output for UI.
 */
const INTERTHINKING_BLOCK_RES: RegExp[] = [
  /<redacted_thinking>[\s\S]*?<\/redacted_thinking>/gi,
  /<thinking>[\s\S]*?<\/thinking>/gi,
]

export function stripInterleavedThinking(text: string): string {
  let s = text
  for (const re of INTERTHINKING_BLOCK_RES) {
    s = s.replace(re, '\n')
  }
  // Unclosed streaming tail (no </…> yet) — never send to QuickJS
  s = s.replace(/<redacted_thinking>[\s\S]*$/gi, '\n')
  s = s.replace(/<thinking>[\s\S]*$/gi, '\n')
  return s.trim()
}

/**
 * Strip optional ```js fences if the model still emits them.
 * Preserves prefix/suffix outside the first fence (e.g. MiniMax `<redacted_thinking>` then fenced code);
 * the previous implementation returned only the fenced body and dropped thinking.
 */
export function stripCodeFences(text: string): string {
  const trimmed = text.trim()
  const fenceRe = /```(?:javascript|js)?\s*([\s\S]*?)```/
  const m = trimmed.match(fenceRe)
  if (!m || m.index === undefined) return trimmed
  const prefix = trimmed.slice(0, m.index).trim()
  const inner = m[1].trim()
  const after = trimmed.slice(m.index + m[0].length).trim()
  let body = prefix ? `${prefix}\n\n${inner}` : inner
  if (after) body = `${body}\n\n${after}`
  return body.trim()
}

/** Runnable JS for harness; aligns with web prepareRunnableJavaScript. */
export function prepareRunnableJavaScript(text: string): string {
  const structured = tryExtractStructuredCodeString(text)
  if (structured) {
    return stripCodeFences(stripInterleavedThinking(structured))
  }
  const { code } = splitThinkingFromModelCode(text)
  return stripCodeFences(stripInterleavedThinking(code))
}

export async function callLLM(provider: 'minimax' | 'deepseek', request: LLMRequest): Promise<LLMResponse> {
  if (!request.problem) {
    throw new Error('callLLM requires problem payload for this API')
  }

  let thought = ''
  for await (const d of streamProblemAnalysis(provider, request.model, request.problem, { source: 'other' })) {
    thought += d
  }

  let code = ''
  for await (const d of streamProblemCode(provider, request.model, request.problem, thought, { source: 'other' })) {
    code += d
  }

  const codingThought = splitThinkingFromModelCode(code).thinking
  const runnable = prepareRunnableJavaScript(code) || '// 未生成代码'

  return {
    thought: thought.trim() || '无分析内容',
    codingThought,
    code: runnable,
  }
}
