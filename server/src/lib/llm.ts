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

/** Normalize OpenAI-compatible non-stream `choices[0].message` (string / parts / reasoning). */
function extractCompletionMessageContent(json: unknown): string {
  const root = json as {
    choices?: Array<{
      message?: {
        content?: unknown
        reasoning_content?: unknown
        text?: unknown
      }
    }>
  }
  const msg = root.choices?.[0]?.message
  if (!msg || typeof msg !== 'object') return ''

  const collectContent = (): string => {
    const c = msg.content
    if (typeof c === 'string') return c
    if (Array.isArray(c)) {
      const chunks: string[] = []
      for (const block of c) {
        if (block && typeof block === 'object') {
          const t = (block as { text?: string }).text
          if (typeof t === 'string') chunks.push(t)
        }
      }
      return chunks.join('')
    }
    return ''
  }

  let text = collectContent().trim()
  if (!text && typeof msg.reasoning_content === 'string') {
    text = msg.reasoning_content.trim()
  }
  if (!text && typeof msg.text === 'string') {
    text = msg.text.trim()
  }
  return text
}

async function chatCompletionContent(
  provider: 'minimax' | 'deepseek',
  platformModelId: string,
  messages: ChatMessage[],
  options: StreamLlmOptions,
): Promise<string> {
  const config = PROVIDERS[provider]
  if (!config.apiKey) {
    throw new Error(`${provider} API key not configured`)
  }
  const apiModel = resolveApiModel(provider, platformModelId)
  const tag = options.logLabel ? ` ${options.logLabel}` : ''
  logChatPrompts(tag, messages)

  const createdAt = new Date().toISOString()
  const t0 = Date.now()
  let outputAccum = ''
  let persistError: string | null = null
  let streamSucceeded = false

  const persistRow = () => {
    if (!isLlmDbLogEnabled()) return
    const cli = getLibsqlClient()
    const completedAt = new Date().toISOString()
    scheduleInsertLlmCallLog(cli, {
      id: crypto.randomUUID(),
      created_at: createdAt,
      completed_at: completedAt,
      source: options.source,
      source_id: options.sourceId ?? null,
      provider,
      model: apiModel,
      messages: serializeMessagesForDb(messages, maxMessagesCharsForDb()),
      output_text: streamSucceeded
        ? truncateOutputForDb(outputAccum, maxOutputCharsForDb())
        : null,
      error: streamSucceeded ? null : persistError,
      duration_ms: Date.now() - t0,
    })
  }

  try {
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
        stream: false,
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      persistError = `${provider} API error: ${response.status} - ${error.slice(0, 500)}`
      throw new Error(persistError)
    }

    const json: unknown = await response.json()
    const content = extractCompletionMessageContent(json)
    if (!content) {
      const preview = JSON.stringify(json).slice(0, 1200)
      console.error(`[llm]${tag} non-stream empty message.content; body preview=${preview}`)
      persistError = '模型返回空正文（请检查 API Key、模型名或非流式响应格式）'
      throw new Error(persistError)
    }

    outputAccum = content
    streamSucceeded = true
    return content.trim()
  } catch (e) {
    if (persistError === null) {
      persistError = e instanceof Error ? e.message : String(e)
    }
    throw e
  } finally {
    persistRow()
  }
}

const PROBLEM_AUTHORING_SYSTEM = `你是竞赛编程题库助手。用户可能只提供题目描述；也可能额外提供标题、函数签名、以及若干用例的输入 data（二维 JSON：每个用例是传给函数的参数数组）。

你的任务：
- 若用户未给函数签名：根据题意设计一条合理的 JavaScript/TypeScript 风格函数声明（含参数名与类型注解），并令 entryPoint 与声明中的函数名一致。
- 若用户未给用例 data 或为空：自行设计至少 3 条有代表性的测试输入（覆盖典型与边界），与签名参数顺序一致。
- 若用户已给用例 data：在保持 data 内容不变的前提下补全判题信息；需要时可微调但优先尊重用户 data。

判题规则：
1) 若答案可用结构化相等判定（整数、数组、布尔等），gradingMode 用 "expected"，每个用例给出 ans。
2) 若多解、浮点容差、无序集合等，gradingMode 用 "verify"，输出完整 verify 函数源码（JavaScript）。
3) verify 约定：function verify(...args, candidate) { ... }，args 与 data 展开顺序一致，candidate 为选手返回值；返回 true 表示通过。

输出：只输出一个可被 JSON.parse 解析的 JSON 对象，不要 Markdown、不要其它文字。键名必须包含：
title（简短题目标题，若用户已有标题可沿用或略改）,
functionSignature（完整一行函数声明，与 entryPoint 一致）,
entryPoint, gradingMode, testCases, verifySource（verify 时为字符串否则 null）, reasoning。
testCases 每项含 data 与 ans（expected 时 ans 必填）。字符串内换行用 \\n，双引号用 \\"，保证合法 JSON。`

export type ProblemAuthoringParsed = {
  title?: string
  functionSignature?: string
  entryPoint: string
  gradingMode: 'expected' | 'verify'
  testCases: Array<{ data: unknown[]; ans?: unknown }>
  verifySource?: string | null
  reasoning?: string
}

/** Remove trailing commas before } or ] (invalid JSON but common in model output). */
function stripTrailingCommasInJson(json: string): string {
  return json.replace(/,\s*(\]|\})/g, '$1')
}

/** First top-level `{ ... }` with string-aware brace matching. */
function extractBalancedJsonObject(s: string): string | null {
  const start = s.indexOf('{')
  if (start < 0) return null
  let depth = 0
  let inStr = false
  let esc = false
  for (let i = start; i < s.length; i++) {
    const c = s[i]
    if (inStr) {
      if (esc) {
        esc = false
        continue
      }
      if (c === '\\') {
        esc = true
        continue
      }
      if (c === '"') inStr = false
      continue
    }
    if (c === '"') {
      inStr = true
      continue
    }
    if (c === '{') depth++
    else if (c === '}') {
      depth--
      if (depth === 0) return s.slice(start, i + 1)
    }
  }
  return null
}

function tryParseAuthoringRecord(raw: string): Record<string, unknown> | null {
  const cleaned = stripInterleavedThinking(raw).trim()
  const attempts: string[] = [cleaned]
  for (const m of cleaned.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) {
    attempts.push(m[1].trim())
  }

  for (let chunk of attempts) {
    chunk = chunk.trim()
    if (!chunk) continue

    const tryOne = (s: string): Record<string, unknown> | null => {
      const t = s.trim()
      if (!t) return null
      try {
        const v = JSON.parse(t) as unknown
        if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>
      } catch {
        /* continue */
      }
      return null
    }

    const direct = tryOne(chunk)
    if (direct) return direct

    const balanced = extractBalancedJsonObject(chunk)
    if (balanced) {
      const a = tryOne(balanced)
      if (a) return a
      const b = tryOne(stripTrailingCommasInJson(balanced))
      if (b) return b
    }

    const i = chunk.indexOf('{')
    const j = chunk.lastIndexOf('}')
    if (i >= 0 && j > i) {
      const slice = chunk.slice(i, j + 1)
      const a = tryOne(slice)
      if (a) return a
      const b = tryOne(stripTrailingCommasInJson(slice))
      if (b) return b
    }
  }
  return null
}

function normalizeAuthoringKeys(o: Record<string, unknown>): Record<string, unknown> {
  const out = { ...o }
  if (out.entryPoint == null && typeof out['入口函数名'] === 'string') {
    out.entryPoint = out['入口函数名']
  }
  if (out.entryPoint == null && typeof out['入口'] === 'string') {
    out.entryPoint = out['入口']
  }
  if (out.gradingMode == null && typeof out['判题模式'] === 'string') {
    out.gradingMode = out['判题模式']
  }
  if (typeof out.gradingMode === 'string') {
    const raw = out.gradingMode.trim()
    const v = raw.toLowerCase()
    if (
      v === 'verify' ||
      raw.includes('验证') ||
      v.includes('verify')
    ) {
      out.gradingMode = 'verify'
    } else if (
      v === 'expected' ||
      raw.includes('标准') ||
      v.includes('expected')
    ) {
      out.gradingMode = 'expected'
    }
  }
  if (out.verifySource == null && typeof out['verify'] === 'string') {
    out.verifySource = out['verify']
  }
  if (out.verifySource == null && typeof out['验证函数'] === 'string') {
    out.verifySource = out['验证函数']
  }
  if (out.reasoning == null && typeof out['说明'] === 'string') {
    out.reasoning = out['说明']
  }
  if (!Array.isArray(out.testCases) && Array.isArray(out['用例'])) {
    out.testCases = out['用例']
  }
  if (out.title == null && typeof out['题目标题'] === 'string') {
    out.title = out['题目标题']
  }
  if (out.functionSignature == null && typeof out['函数签名'] === 'string') {
    out.functionSignature = out['函数签名']
  }
  return out
}

export async function generateProblemAuthoring(
  provider: 'minimax' | 'deepseek',
  platformModelId: string,
  input: {
    title?: string
    description?: string
    functionSignature?: string
    testCasesData: unknown[][]
    tags?: string[]
  },
  options: StreamLlmOptions,
): Promise<ProblemAuthoringParsed> {
  const userPayload = {
    title: input.title?.trim() ?? '',
    description: input.description?.trim() ?? '',
    functionSignature: input.functionSignature?.trim() ?? '',
    tags: input.tags ?? [],
    testCasesData: input.testCasesData,
  }
  const raw = await chatCompletionContent(
    provider,
    platformModelId,
    [
      { role: 'system', content: PROBLEM_AUTHORING_SYSTEM },
      {
        role: 'user',
        content:
          `请根据以下 JSON 生成命题助手输出（你的整段回复必须且仅为一个可被 JSON.parse 解析的对象，不要其它文字）：\n${JSON.stringify(userPayload)}`,
      },
    ],
    { ...options, logLabel: options.logLabel ?? 'problem_authoring' },
  )

  const parsedObj = tryParseAuthoringRecord(raw)
  if (!parsedObj) {
    const preview = raw.length > 600 ? `${raw.slice(0, 600)}…` : raw
    console.error(`[llm] problem_authoring parse failed, rawLen=${raw.length} preview=\n${preview}`)
    throw new Error(
      '命题助手返回的内容无法解析为 JSON。请重试；若多次失败可缩短描述或检查模型是否按指令只输出 JSON。',
    )
  }
  const o = normalizeAuthoringKeys(parsedObj)
  const entryPoint = typeof o.entryPoint === 'string' ? o.entryPoint.trim() : ''
  const gradingMode = o.gradingMode === 'verify' ? 'verify' : 'expected'
  if (!entryPoint) throw new Error('JSON 缺少 entryPoint')

  const titleOut =
    typeof o.title === 'string' && o.title.trim() ? o.title.trim() : undefined
  const functionSignatureOut =
    typeof o.functionSignature === 'string' && o.functionSignature.trim()
      ? o.functionSignature.trim()
      : undefined

  const tcsRaw = o.testCases
  const testCases: Array<{ data: unknown[]; ans?: unknown }> = []
  if (Array.isArray(tcsRaw)) {
    for (const item of tcsRaw) {
      if (!item || typeof item !== 'object') continue
      const row = item as Record<string, unknown>
      const data = row.data
      if (!Array.isArray(data)) continue
      const ans = row.ans
      testCases.push({
        data: data as unknown[],
        ans: ans !== undefined ? ans : undefined,
      })
    }
  }

  if (testCases.length === 0) {
    for (const d of input.testCasesData) {
      testCases.push({ data: [...d] })
    }
  }

  if (testCases.length === 0) {
    throw new Error('模型未返回有效测试用例，请重试或补充题干细节')
  }

  if (gradingMode === 'expected') {
    for (let i = 0; i < testCases.length; i++) {
      if (testCases[i].ans === undefined) {
        throw new Error(`expected 模式下第 ${i + 1} 条用例缺少 ans`)
      }
    }
  }

  const verifySource =
    typeof o.verifySource === 'string' && o.verifySource.trim() ? o.verifySource.trim() : null

  return {
    ...(titleOut ? { title: titleOut } : {}),
    ...(functionSignatureOut ? { functionSignature: functionSignatureOut } : {}),
    entryPoint,
    gradingMode,
    testCases,
    verifySource: gradingMode === 'verify' ? verifySource : null,
    reasoning: typeof o.reasoning === 'string' ? o.reasoning : undefined,
  }
}
