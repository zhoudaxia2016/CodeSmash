import { tryParseJsonObjectFromText } from '../utils.ts'
import { getAuthoringResponseSchema } from './schema.ts'
import type {
  AuthoringResponsePayload,
  AuthoringResponseTestCase,
  ProblemAuthoringInput,
  ProblemAuthoringParsed,
} from './types.ts'

export function parseProblemAuthoringResponse(
  raw: string,
  input: ProblemAuthoringInput,
): ProblemAuthoringParsed {
  const { title = '', entryPoint = '', functionSignature = '', authoringMode = 'append'} = input
  const lockVerifySource = input.lockVerifySource === true
  const { schema } = getAuthoringResponseSchema({
    title, entryPoint, functionSignature,
    authoringMode, lockVerifySource,
    verifySource: input.verifySource ?? '',
  })
  const parsedObj = tryParseJsonObjectFromText(raw)
  if (!parsedObj) {
    const preview = raw.length > 600 ? `${raw.slice(0, 600)}…` : raw
    console.error(`[llm] problem_authoring parse failed, rawLen=${raw.length} preview=\n${preview}`)
    throw new Error(
      '命题助手返回的内容无法解析为 JSON。请重试；若多次失败可缩短描述或检查模型是否按指令只输出 JSON。',
    )
  }
  const parsed = schema.safeParse(parsedObj)
  if (!parsed.success) {
    console.error(parsed)
    throw new Error('命题助手返回的 JSON 不符合 schema。请重试。')
  }
  const payload = parsed.data as AuthoringResponsePayload
  const testCases: Array<{ data: unknown[]; ans?: unknown }> = (payload.testCases ?? []).map((row: AuthoringResponseTestCase) => ({
    data: row.data,
    ans: row.ans !== undefined ? row.ans : undefined,
  }))

  return {
    ...(payload.title ? { title: payload.title } : {}),
    ...(payload.functionSignature ? { functionSignature: payload.functionSignature } : {}),
    ...(payload.entryPoint ? { entryPoint: payload.entryPoint } : {}),
    testCases,
    ...(payload.verifySource ? { verifySource: payload.verifySource } : {}),
    reasoning: payload.reasoning,
  }
}
