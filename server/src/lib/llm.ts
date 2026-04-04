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
  /** 例如 `[battle=uuid side=A] analysis`，便于对照服务端日志 */
  logLabel = '',
): AsyncGenerator<string, void, unknown> {
  const tag = logLabel ? ` ${logLabel}` : ''
  const config = PROVIDERS[provider]
  if (!config.apiKey) {
    console.error(`[llm]${tag} abort: ${provider} API key not configured`)
    throw new Error(`${provider} API key not configured`)
  }

  const apiModel = resolveApiModel(provider, platformModelId)
  const t0 = Date.now()
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
            yield wrapped
            pendingReasoning = ''
          }
          deltaChunks++
          deltaChars += content.length
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
    yield wrapped
  }

  console.log(
    `[llm]${tag} stream done deltaChunks=${deltaChunks} deltaChars=${deltaChars} totalMs=${Date.now() - t0}`,
  )
}

const ANALYSIS_SYSTEM = `You are an expert at algorithm design. For the given programming problem, explain your reasoning ONLY:
- proposed approach
- time and space complexity
- edge cases to watch

Strict rules:
- Do NOT write code.
- Do NOT use markdown code fences (triple backticks).
- Do NOT output function definitions or snippets that look like executable JavaScript.
Use plain language; short bullet lists are fine.`

function buildCodeSystem(entryPoint: string, functionSignature: string): string {
  return `You output JavaScript only for an automated test harness.

Implement exactly this top-level declaration—identifier, parameter list, and return semantics. Types in the signature are hints; emit plain JavaScript.

${functionSignature}

Rules:
- The declaration above is authoritative: do not rename the function, change arity, or reorder parameters.
- The harness calls ${entryPoint} according to that declaration and the problem description.
- Small top-level helpers are allowed if the declared function remains exactly as above.
- No markdown code fences around the solution. Include the JavaScript that implements the signature; if your endpoint emits internal reasoning in XML-style wrappers, that is acceptable alongside the code.
- Use a plain top-level function; do not export modules or place the required function inside an object.
- Output exactly ONE complete top-level \`function ${entryPoint}\` (or the single declaration that matches the signature). Do not emit two full implementations of the same entry function—no draft-then-final duplicate, no repeating the same function after self-review. If you revise, replace mentally and stream only the final single version.
- Do not paste verification commentary, complexity bullets, or quotes from system/user messages into the JavaScript body; keep that in your reasoning channel only, not as prose between two code copies.
- Never output fake or partial XML markers (e.g. closing tags alone) in the JavaScript stream.`
}

export async function* streamProblemAnalysis(
  provider: 'minimax' | 'deepseek',
  platformModelId: string,
  problem: ProblemPayload,
  logLabel?: string,
): AsyncGenerator<string, void, unknown> {
  const user = `Title: ${problem.title}

Description:
${problem.description}

Required function signature:
${problem.functionSignature}

Analyze how you would solve this. Remember: no code.`

  const tag = logLabel ? `${logLabel} analysis` : 'analysis'
  yield* streamChat(provider, platformModelId, [
    { role: 'system', content: ANALYSIS_SYSTEM },
    { role: 'user', content: user },
  ], tag)
}

export async function* streamProblemCode(
  provider: 'minimax' | 'deepseek',
  platformModelId: string,
  problem: ProblemPayload,
  analysis: string,
  logLabel?: string,
): AsyncGenerator<string, void, unknown> {
  const user = `Title: ${problem.title}

Description:
${problem.description}

Required function signature (implement this declaration exactly):
${problem.functionSignature}

Your earlier analysis (context only — do not repeat it in your output):
${analysis}

Write only JavaScript that fulfills the required signature above. One final program: a single implementation of ${problem.entryPoint}, nothing duplicated.`

  const tag = logLabel ? `${logLabel} code` : 'code'
  yield* streamChat(provider, platformModelId, [
    { role: 'system', content: buildCodeSystem(problem.entryPoint, problem.functionSignature) },
    { role: 'user', content: user },
  ], tag)
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
  return s.trim()
}

function removeLeakedThinkingMarkers(s: string): string {
  return s
    .replace(/<\/redacted_thinking>/gi, '\n')
    .replace(/<redacted_thinking>/gi, '\n')
    .replace(/<\/thinking>/gi, '\n')
    .replace(/<thinking>/gi, '\n')
}

/** Same heuristic as web `stripCodeFences.ts` for runnable extraction. */
function extractLastMainBlock(s: string): { prefix: string; code: string } {
  const re = /^function\s+main\b/gm
  const idx: number[] = []
  let m: RegExpExecArray | null
  const r = new RegExp(re.source, 'gm')
  while ((m = r.exec(s)) !== null) idx.push(m.index)
  if (idx.length < 2) return { prefix: '', code: s }
  const start = idx[idx.length - 1]!
  return { prefix: s.slice(0, start).trim(), code: s.slice(start).trim() }
}

/** Drop natural-language preamble before first ```js fence (matches web split for runnable extraction). */
function stripLeadingProseBeforeFence(s: string): string {
  const t = s.trim()
  const idx = t.search(/```(?:javascript|js)?/)
  if (idx <= 0) return t
  return t.slice(idx).trim()
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

/** Thinking strip, prose before fence, duplicate-main pick, then fences; use before executing generated code, not when persisting streamed battle output. */
export function prepareRunnableJavaScript(text: string): string {
  let s = stripInterleavedThinking(text)
  s = removeLeakedThinkingMarkers(s)
  s = stripLeadingProseBeforeFence(s)
  const { code } = extractLastMainBlock(s)
  return stripCodeFences(code)
}

export async function callLLM(provider: 'minimax' | 'deepseek', request: LLMRequest): Promise<LLMResponse> {
  if (!request.problem) {
    throw new Error('callLLM requires problem payload for this API')
  }

  let thought = ''
  for await (const d of streamProblemAnalysis(provider, request.model, request.problem)) {
    thought += d
  }

  let code = ''
  for await (const d of streamProblemCode(provider, request.model, request.problem, thought)) {
    code += d
  }

  return {
    thought: thought.trim() || 'No analysis',
    code: prepareRunnableJavaScript(code) || '// No code generated',
  }
}
