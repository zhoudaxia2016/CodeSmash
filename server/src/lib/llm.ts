import { getLibsqlClient } from '../db/client.ts'
import {
  isLlmDbLogEnabled,
  maxMessagesCharsForDb,
  maxOutputCharsForDb,
  scheduleInsertLlmCallLog,
  serializeLlmOutputJsonForDb,
  serializeMessagesForDb,
  type LlmCallOutputJson,
  type LlmCallSource,
} from '../db/llmCallLog.ts'
import { coerceAuthoringExpectedAns } from './expectedAnsAlternatives.ts'
import { tryExtractStructuredCodeString } from './modelStructuredParse.ts'
import {
  mergeReasoningAndXmlCodingThought,
  sanitizeModelThoughtMarkdown,
  splitThinkingFromModelCode,
  thinkingCloseLiteral,
  THINKING_TAGS,
} from './codePhaseSplit.ts'

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

/** SSE deltas: reasoning_* vs `content` stay separate end-to-end (no synthetic XML merge). */
export type ChatStreamPart = { kind: 'reasoning'; text: string } | { kind: 'content'; text: string }

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

/** One SSE `delta` slice before merging into `LlmCallOutputJson`. */
type OpenAiDeltaSlice = {
  reasoning_content?: string
  reasoning_details?: Array<{ text: string }>
  thinking?: string
  content?: string
}

function deltaFromOpenAiDelta(d: Record<string, unknown>): OpenAiDeltaSlice | null {
  const out: OpenAiDeltaSlice = {}
  const rc = d.reasoning_content
  if (typeof rc === 'string' && rc.length > 0) out.reasoning_content = rc
  const rd = d.reasoning_details
  if (Array.isArray(rd)) {
    const details: Array<{ text: string }> = []
    for (const item of rd) {
      if (item && typeof item === 'object' && 'text' in item) {
        const t = (item as { text?: unknown }).text
        if (typeof t === 'string' && t.length > 0) details.push({ text: t })
      }
    }
    if (details.length > 0) out.reasoning_details = details
  }
  const th = d.thinking
  if (typeof th === 'string' && th.length > 0) out.thinking = th
  const c = d.content
  if (typeof c === 'string' && c.length > 0) out.content = c
  if (Object.keys(out).length === 0) return null
  return out
}

function mergeOpenAiSliceIntoLlmJson(acc: LlmCallOutputJson, slice: OpenAiDeltaSlice): void {
  if (slice.reasoning_content) {
    acc.reasoning_content = (acc.reasoning_content ?? '') + slice.reasoning_content
  }
  if (slice.reasoning_details?.length) {
    const chunk = slice.reasoning_details.map((x) => x.text).join('')
    acc.reasoning_details = (acc.reasoning_details ?? '') + chunk
  }
  if (slice.thinking) acc.thinking = (acc.thinking ?? '') + slice.thinking
  if (slice.content) acc.content = (acc.content ?? '') + slice.content
}

/** Non-stream `choices[0].message`: same fields as delta, plus `content` as string or parts array. */
function messageToOutputDelta(msg: unknown): OpenAiDeltaSlice {
  if (!msg || typeof msg !== 'object') return {}
  const m = msg as Record<string, unknown>
  const out: OpenAiDeltaSlice = {}
  if (typeof m.reasoning_content === 'string' && m.reasoning_content.length > 0) {
    out.reasoning_content = m.reasoning_content
  }
  const rd = m.reasoning_details
  if (Array.isArray(rd)) {
    const details: Array<{ text: string }> = []
    for (const item of rd) {
      if (item && typeof item === 'object' && 'text' in item) {
        const t = (item as { text?: unknown }).text
        if (typeof t === 'string' && t.length > 0) details.push({ text: t })
      }
    }
    if (details.length > 0) out.reasoning_details = details
  }
  if (typeof m.thinking === 'string' && m.thinking.length > 0) out.thinking = m.thinking
  const c = m.content
  if (typeof c === 'string' && c.length > 0) out.content = c
  else if (Array.isArray(c)) {
    const chunks: string[] = []
    for (const block of c) {
      if (block && typeof block === 'object') {
        const t = (block as { text?: string }).text
        if (typeof t === 'string') chunks.push(t)
      }
    }
    const joined = chunks.join('')
    if (joined) out.content = joined
  }
  return out
}

function messageToLlmCallOutputJson(msg: unknown): LlmCallOutputJson {
  const o: LlmCallOutputJson = { mode: 'complete' }
  mergeOpenAiSliceIntoLlmJson(o, messageToOutputDelta(msg))
  return o
}

async function* streamChatParts(
  provider: 'minimax' | 'deepseek',
  platformModelId: string,
  messages: ChatMessage[],
  options: StreamLlmOptions,
): AsyncGenerator<ChatStreamPart, void, unknown> {
  const logLabel = options.logLabel ?? ''
  const tag = logLabel ? ` ${logLabel}` : ''
  const config = PROVIDERS[provider]
  const createdAt = new Date().toISOString()
  const t0 = Date.now()

  let shouldPersist = false
  let apiModel = ''
  let streamSucceeded = false
  const outputMerged: LlmCallOutputJson = { mode: 'stream' }
  let persistError: string | null = null

  const persistRow = () => {
    if (!shouldPersist || !isLlmDbLogEnabled()) return
    const cli = getLibsqlClient()
    const completedAt = new Date().toISOString()
    const messagesJson = serializeMessagesForDb(messages, maxMessagesCharsForDb())
    const output_json = streamSucceeded
      ? serializeLlmOutputJsonForDb(outputMerged, maxOutputCharsForDb())
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
      output_json,
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

          const rec = d as Record<string, unknown>
          const logged = deltaFromOpenAiDelta(rec)
          if (logged) mergeOpenAiSliceIntoLlmJson(outputMerged, logged)
          else {
            const onlyContent = rec.content
            if (typeof onlyContent === 'string' && onlyContent.length > 0) {
              outputMerged.content = (outputMerged.content ?? '') + onlyContent
            }
          }

          let rp = ''
          if (logged?.reasoning_content) rp += logged.reasoning_content
          if (logged?.reasoning_details) {
            for (const x of logged.reasoning_details) rp += x.text
          }
          if (logged?.thinking) rp += logged.thinking

          if (rp) {
            deltaChunks++
            deltaChars += rp.length
            yield { kind: 'reasoning', text: rp }
          }

          const content = typeof rec.content === 'string' ? rec.content : ''
          if (content.length > 0) {
            deltaChunks++
            deltaChars += content.length
            yield { kind: 'content', text: content }
          }
        } catch {
          // ignore partial JSON lines
        }
      }
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
- 若 API 提供单独的推理通道，请在那里做规划；主消息流保持为可运行程序。
- 禁止在回复中出现 \`<redacted_thinking>\`、\`</think>\` 或 \`<thinking>\` 等标签字面量（会导致评测解析失败）。`
}

export function buildAnalysisRoundZeroUserContent(
  problem: ProblemPayload,
  gradingMode: 'expected' | 'verify',
): string {
  const core = `题目：${problem.title}

题目描述：
${problem.description}

要求的函数签名：
${problem.functionSignature}

请说明你打算如何求解本题。注意：不要写代码。`
  if (gradingMode === 'verify') {
    return `说明：本题使用 verify 脚本判题（非纯期望输出对比）。\n\n${core}`
  }
  return core
}

export function buildCodePhaseInstructionUserContent(problem: ProblemPayload): string {
  return (
    `请写出 JavaScript 实现：仅一个符合签名的 ${problem.entryPoint}，不要重复实现。` +
    `基于你上文的分析完成实现；不要在输出中重复大段说明文字。` +
    `直接输出可执行源码，不要在整段外加双引号或单引号，不要用字符串包裹 function，不要在 function 后加分析。`
  )
}

/** Minimal shape for replaying closed battle rounds as chat messages (refine / logs). */
export type BattleRoundHistoryPayload = {
  thought: string
  codingThought: string
  code: string
  refineUserMessage?: string
  officialResult?: {
    passed: number
    total: number
    timeMs: number
    details?: Array<{
      passed: boolean
      input: string
      expectedOutput: string
      actualOutput: string
    }>
  }
}

function formatFailedCasesForHistory(
  details:
    | Array<{
        passed: boolean
        input: string
        expectedOutput: string
        actualOutput: string
      }>
    | undefined,
  include: boolean,
): string | undefined {
  if (!include || !details?.length) return undefined
  const failed = details.filter((d) => !d.passed)
  if (!failed.length) return undefined
  return failed
    .map(
      (d, i) =>
        `用例 ${i + 1}：\n输入：${d.input}\n期望：${d.expectedOutput}\n实际：${d.actualOutput}\n`,
    )
    .join('\n')
}

export function buildOfficialFeedbackUserContent(
  roundIndex: number,
  round: BattleRoundHistoryPayload,
  includeFailed: boolean,
): string {
  const o = round.officialResult
  let s = `【第 ${roundIndex + 1} 轮 · 评测结果】\n通过 ${o?.passed ?? 0}/${o?.total ?? 0}，执行耗时 ${
    o?.timeMs ?? 0
  } ms`
  const fb = formatFailedCasesForHistory(o?.details, includeFailed)
  if (fb) s += `\n\n未通过用例详情：\n${fb}`
  return s
}

function buildAssistantCodePhaseContent(codingThought: string, code: string): string {
  const ct = codingThought.trim()
  const c = code.trim()
  if (ct && c) return `${ct}\n\n${c}`
  if (c) return c
  if (ct) return ct
  return '（该轮未产生代码阶段文本。）'
}

const ANALYSIS_REFINE_SYSTEM = `你是算法设计专家。你与用户就同一道编程题进行多轮对话；消息历史中已包含题目全文、你此前的分析与代码、以及各轮评测结果。
**最新一条用户消息**中会同时给出本轮官方评测结果（及可选的未通过用例详情）以及用户的追问或补充说明；请据此重新阐述本轮打算采用的思路（可修正或推翻此前方案）。

要求与首轮分析一致：思路、复杂度、边界；不要写代码、不要用 Markdown 代码块、不要输出可执行 JavaScript。`

/**
 * 追问侧 user 片段（不含评测块）。题目已在历史首条 user 中。
 * 无补充文字时不写「无补充」类说明，仅保留任务句。
 */
export function buildRefineFollowUpUserContent(userMessage: string): string {
  const t = userMessage.trim()
  if (t) {
    return `【用户追问 / 补充说明】\n${t}\n\n请在此基础上重新说明本轮打算如何求解。注意：不要写代码、不要输出可执行 JavaScript。`
  }
  return `请结合上述评测结果重新说明本轮打算如何求解。注意：不要写代码、不要输出可执行 JavaScript。`
}

/** 单条 user：官方评测（含可选失败用例）+ 追问说明，供新一轮 refine 使用。 */
export function buildOfficialPlusRefineUserMessage(
  roundIndex: number,
  round: BattleRoundHistoryPayload,
  includeFailed: boolean,
  userRefineRaw: string,
): string {
  const official = buildOfficialFeedbackUserContent(roundIndex, round, includeFailed)
  const refine = buildRefineFollowUpUserContent(userRefineRaw)
  return `${official}\n\n${refine}`
}

/**
 * 所有已结束轮次直到**最后一轮代码 assistant 之后**（不含最后一轮的评测 user；由调用方与新一轮追问合并为一条 user）。
 */
export function buildBattleClosedRoundsHistoryMessages(
  problem: ProblemPayload,
  gradingMode: 'expected' | 'verify',
  rounds: BattleRoundHistoryPayload[],
  includeFailed: boolean,
): ChatMessage[] {
  const out: ChatMessage[] = []
  if (rounds.length === 0) return out

  for (let i = 0; i < rounds.length; i++) {
    const r = rounds[i]
    if (i === 0) {
      out.push({ role: 'user', content: buildAnalysisRoundZeroUserContent(problem, gradingMode) })
      out.push({ role: 'assistant', content: r.thought.trim() || '（未产生分析文本。）' })
    } else {
      const prev = rounds[i - 1]
      const rawRef = rounds[i].refineUserMessage ?? ''
      out.push({
        role: 'user',
        content: buildOfficialPlusRefineUserMessage(i - 1, prev, includeFailed, rawRef),
      })
      out.push({ role: 'assistant', content: r.thought.trim() || '（未产生分析文本。）' })
    }
    out.push({ role: 'user', content: buildCodePhaseInstructionUserContent(problem) })
    out.push({
      role: 'assistant',
      content: buildAssistantCodePhaseContent(r.codingThought, r.code),
    })
  }
  return out
}

export async function* streamBattleRefineAnalysis(
  provider: 'minimax' | 'deepseek',
  platformModelId: string,
  historyThroughLastCodeAssistant: ChatMessage[],
  officialPlusRefineUserContent: string,
  options: StreamLlmOptions,
): AsyncGenerator<string, void, unknown> {
  const logLabel = options.logLabel ? `${options.logLabel} analysis_refine` : 'analysis_refine'
  const messages: ChatMessage[] = [
    { role: 'system', content: ANALYSIS_REFINE_SYSTEM },
    ...historyThroughLastCodeAssistant,
    { role: 'user', content: officialPlusRefineUserContent },
  ]
  for await (const part of streamChatParts(provider, platformModelId, messages, {
    ...options,
    logLabel,
  })) {
    yield part.text
  }
}

export async function* streamBattleRefineCode(
  provider: 'minimax' | 'deepseek',
  platformModelId: string,
  problem: ProblemPayload,
  historyThroughLastCodeAssistant: ChatMessage[],
  officialPlusRefineUserContent: string,
  analysis: string,
  options: StreamLlmOptions,
): AsyncGenerator<ChatStreamPart, void, unknown> {
  const assistantAnalysis = analysis.trim() || '（上一步未产生分析文本。）'
  const logLabel = options.logLabel ? `${options.logLabel} code` : 'code'
  const messages: ChatMessage[] = [
    { role: 'system', content: buildCodeSystem(problem.entryPoint, problem.functionSignature) },
    ...historyThroughLastCodeAssistant,
    { role: 'user', content: officialPlusRefineUserContent },
    { role: 'assistant', content: assistantAnalysis },
    { role: 'user', content: buildCodePhaseInstructionUserContent(problem) },
  ]
  yield* streamChatParts(provider, platformModelId, messages, { ...options, logLabel })
}

export async function* streamProblemAnalysis(
  provider: 'minimax' | 'deepseek',
  platformModelId: string,
  problem: ProblemPayload,
  gradingMode: 'expected' | 'verify',
  options: StreamLlmOptions,
): AsyncGenerator<string, void, unknown> {
  const user = buildAnalysisRoundZeroUserContent(problem, gradingMode)

  const logLabel = options.logLabel
    ? `${options.logLabel} analysis`
    : 'analysis'
  for await (const part of streamChatParts(provider, platformModelId, [
    { role: 'system', content: ANALYSIS_SYSTEM },
    { role: 'user', content: user },
  ], { ...options, logLabel })) {
    yield part.text
  }
}

/**
 * 代码阶段：第二次 HTTP 请求（因需换 `system` 为代码约束）。`messages` 与首轮分析**同一条对话线程**：
 * 首条 `user` 与 `streamProblemAnalysis` 中**完全一致**（含 verify 说明），接着是上一步的 `assistant`，再接写代码指令。
 */
export async function* streamProblemCode(
  provider: 'minimax' | 'deepseek',
  platformModelId: string,
  problem: ProblemPayload,
  gradingMode: 'expected' | 'verify',
  analysis: string,
  options: StreamLlmOptions,
): AsyncGenerator<ChatStreamPart, void, unknown> {
  const analysisPhaseUser = buildAnalysisRoundZeroUserContent(problem, gradingMode)
  const assistantAnalysis = analysis.trim() || '（上一步未产生分析文本。）'
  const codeUser = buildCodePhaseInstructionUserContent(problem)

  const logLabel = options.logLabel ? `${options.logLabel} code` : 'code'
  yield* streamChatParts(provider, platformModelId, [
    { role: 'system', content: buildCodeSystem(problem.entryPoint, problem.functionSignature) },
    { role: 'user', content: analysisPhaseUser },
    { role: 'assistant', content: assistantAnalysis },
    { role: 'user', content: codeUser },
  ], { ...options, logLabel })
}

function escapeRegExpForThinking(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** 仅用于命题 JSON 等解析前清洗；不在流式 / finalizeRunnable 里跑（避免每 chunk 多轮正则）。 */
function stripThinkingXmlForAuthoringParse(s: string): string {
  let t = s
  for (const spec of THINKING_TAGS) {
    const { openName } = spec
    const closeLiteral = thinkingCloseLiteral(spec)
    const closeEsc = escapeRegExpForThinking(closeLiteral)
    const pair = new RegExp(`<${openName}\\b[^>]*>[\\s\\S]*?${closeEsc}`, 'gi')
    t = t.replace(pair, '\n')
  }
  for (const { openName } of THINKING_TAGS) {
    t = t.replace(new RegExp(`<${openName}\\b[^>]*>[\\s\\S]*$`, 'gi'), '\n')
  }
  for (const spec of THINKING_TAGS) {
    const { openName } = spec
    const closeLiteral = thinkingCloseLiteral(spec)
    t = t.replace(new RegExp(escapeRegExpForThinking(closeLiteral), 'gi'), '\n')
    t = t.replace(new RegExp(`<${openName}\\b[^>]*>`, 'gi'), '\n')
  }
  return t.replace(/\n{3,}/g, '\n\n').trim()
}

export function stripInterleavedThinking(text: string): string {
  return stripThinkingXmlForAuthoringParse(text)
}

/** First ```js / ```javascript fenced block body only, if present; else unchanged. */
export function stripCodeFences(text: string): string {
  const t = text.trim()
  const m = t.match(/```(?:javascript|js)?\s*([\s\S]*?)```/)
  return m ? m[1].trim() : t
}

/** 仅当整段像 JSON 结构化代码阶段时才尝试抽 `代码` 字段，避免把含 `{` 的普通 JS 截断。 */
function shouldTryStructuredCodeExtract(s: string): boolean {
  const t = s.trimStart()
  return t.startsWith('{') || t.startsWith('[') || /^```(?:json)?\b/i.test(t)
}

/** Runnable JS：`splitThinkingFromModelCode` 后不再做 XML 剥离（省流式每 tick 成本）。 */
export function finalizeRunnableFromCodeOnly(code: string): string {
  const t = code.trim()
  const base = shouldTryStructuredCodeExtract(t) ? (tryExtractStructuredCodeString(t) ?? t) : t
  return stripCodeFences(base).trim()
}

/** Runnable JS for harness; aligns with web prepareRunnableJavaScript. */
export function prepareRunnableJavaScript(text: string): string {
  const { code } = splitThinkingFromModelCode(text.trim())
  return finalizeRunnableFromCodeOnly(code)
}

export async function callLLM(provider: 'minimax' | 'deepseek', request: LLMRequest): Promise<LLMResponse> {
  if (!request.problem) {
    throw new Error('callLLM requires problem payload for this API')
  }

  let thought = ''
  for await (const d of streamProblemAnalysis(provider, request.model, request.problem, 'expected', {
    source: 'other',
  })) {
    thought += d
  }

  let reasoning = ''
  let content = ''
  for await (const part of streamProblemCode(provider, request.model, request.problem, 'expected', thought, {
    source: 'other',
  })) {
    if (part.kind === 'reasoning') reasoning += part.text
    else content += part.text
  }

  const { thinking: xmlThink, code: codeOnly } = splitThinkingFromModelCode(content)
  const codingThought = mergeReasoningAndXmlCodingThought(reasoning, xmlThink)
  const runnable = finalizeRunnableFromCodeOnly(codeOnly) || '// 未生成代码'

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
  let completionOutputJson: LlmCallOutputJson = { mode: 'complete' }
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
      output_json: streamSucceeded
        ? serializeLlmOutputJsonForDb(completionOutputJson, maxOutputCharsForDb())
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
    const root = json as { choices?: Array<{ message?: unknown }> }
    completionOutputJson = messageToLlmCallOutputJson(root.choices?.[0]?.message)
    const content = extractCompletionMessageContent(json)
    if (!content) {
      const preview = JSON.stringify(json).slice(0, 1200)
      console.error(`[llm]${tag} non-stream empty message.content; body preview=${preview}`)
      persistError = '模型返回空正文（请检查 API Key、模型名或非流式响应格式）'
      throw new Error(persistError)
    }

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

function readProblemAuthoringExpectedAltsLimit(): number {
  const raw = Deno.env.get('PROBLEM_AUTHORING_MAX_EXPECTED_ALTS')?.trim()
  if (!raw) return 5
  const n = parseInt(raw, 10)
  if (!Number.isFinite(n) || n < 1) return 5
  return Math.min(Math.floor(n), 100)
}

const PROBLEM_AUTHORING_SYSTEM_BASE = `你是竞赛编程题库助手。用户消息里有一段 JSON，请生成题目草稿；回复必须且仅为一个可 JSON.parse 的对象（不要 Markdown）。

补全：无签名则自拟一行 JS/TS 声明（entryPoint 与函数名一致）；无用例或 testCasesData 空则至少 3 条；已有用例则保持各条 data。

判题二选一，输出里 gradingMode 只能是字符串 "expected" 或 "verify"：
- "expected"＝**对答案表**：每个用例在 ans 里给一个 JSON 数组，数组里每一项都是一种「判为正确」的选手返回值（与选手输出做 JSON 结构一致即算对）。只有一个正确答案就数组里一项，例如 [5] 或 [[0,3]]；多种合法输出就把它们都放进数组，例如 [1,2,3]。此模式下 verifySource 填 null。
- "verify"＝**自定义检查**：不写死答案表，改写一段可在判题环境运行的 JavaScript：\`function verify(...args, candidate) { return true 或 false }\`，其中参数顺序与该用例的 data 一致，candidate 是选手提交函数的返回值；对了就 return true。整段源码放进 verifySource。

输出字段：title, functionSignature, entryPoint, gradingMode, testCases, verifySource, reasoning。`

const PROBLEM_AUTHORING_SYSTEM_ENFORCE_EXPECTED = `【本期】固定用「对答案表」：每条 testCases 填 ans，verifySource 为 null。`

const PROBLEM_AUTHORING_SYSTEM_ENFORCE_VERIFY = `【本期】固定用「自定义检查」：写非空 verifySource（函数见上）。`

function problemAuthoringSystemFreeChoice(expectedAlternativesBeforeVerify: number): string {
  return `【判题自选】在「对答案表」与「自定义检查」中选一种，gradingMode 填 "expected" 或 "verify" 对应。若选对答案表：全体用例里「可接受结果个数」之和（每个 ans 数组有几项就计几，求和）大于 ${expectedAlternativesBeforeVerify} 时须改用自定义检查；浮点容差、无序结果、多解不好列表时也更宜用自定义检查。`
}

function buildProblemAuthoringSystemContent(input: {
  assistGradingFromForm: boolean
  formGradingMode: 'expected' | 'verify'
  expectedAlternativesBeforeVerify: number
}): string {
  let suffix: string
  if (input.assistGradingFromForm) {
    suffix =
      input.formGradingMode === 'verify'
        ? PROBLEM_AUTHORING_SYSTEM_ENFORCE_VERIFY
        : PROBLEM_AUTHORING_SYSTEM_ENFORCE_EXPECTED
  } else {
    suffix = problemAuthoringSystemFreeChoice(input.expectedAlternativesBeforeVerify)
  }
  return `${PROBLEM_AUTHORING_SYSTEM_BASE}\n\n${suffix}`
}

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

function buildProblemAuthoringUserContent(input: {
  title?: string
  description?: string
  functionSignature?: string
  testCasesData: unknown[][]
  tags?: string[]
}): string {
  const userPayload = {
    title: input.title?.trim() ?? '',
    description: input.description?.trim() ?? '',
    functionSignature: input.functionSignature?.trim() ?? '',
    tags: input.tags ?? [],
    testCasesData: input.testCasesData,
  }
  return `请根据以下 JSON 生成输出（整段回复必须且仅为一个可被 JSON.parse 解析的对象）：\n${JSON.stringify(userPayload)}`
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
    /** 为 true 时命题辅助与表单判题方式（formGradingMode）一致。 */
    assistGradingFromForm?: boolean
    /** 表单当前判题方式；assistGradingFromForm 为 true 时用于提示词与结果校正。 */
    formGradingMode?: 'expected' | 'verify'
  },
  options: StreamLlmOptions,
): Promise<ProblemAuthoringParsed> {
  const assistGradingFromForm = input.assistGradingFromForm === true
  const formGradingMode: 'expected' | 'verify' =
    input.formGradingMode === 'verify' ? 'verify' : 'expected'
  const expectedAlternativesBeforeVerify = readProblemAuthoringExpectedAltsLimit()
  const systemContent = buildProblemAuthoringSystemContent({
    assistGradingFromForm,
    formGradingMode,
    expectedAlternativesBeforeVerify,
  })
  const userContent = buildProblemAuthoringUserContent({
    title: input.title,
    description: input.description,
    functionSignature: input.functionSignature,
    testCasesData: input.testCasesData,
    tags: input.tags,
  })
  const raw = await chatCompletionContent(
    provider,
    platformModelId,
    [
      { role: 'system', content: systemContent },
      {
        role: 'user',
        content: userContent,
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
  if (!entryPoint) throw new Error('JSON 缺少 entryPoint')

  let gradingMode: 'expected' | 'verify'
  if (assistGradingFromForm) {
    gradingMode = formGradingMode
  } else {
    gradingMode = o.gradingMode === 'verify' ? 'verify' : 'expected'
  }

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
      testCases[i].ans = coerceAuthoringExpectedAns(testCases[i].ans)
    }
  }

  const verifySource =
    typeof o.verifySource === 'string' && o.verifySource.trim() ? o.verifySource.trim() : null

  if (assistGradingFromForm && gradingMode === 'verify' && !verifySource) {
    throw new Error(
      'verify 模式下命题助手未返回有效的 verifySource。请重试，或取消勾选「辅助与表单判题一致」后由模型自选。',
    )
  }

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
