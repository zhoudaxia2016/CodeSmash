export type AuthoringMode = 'create' | 'append' | 'fix'

export type ProblemAuthoringParsed = {
  title?: string
  functionSignature?: string
  entryPoint?: string
  testCases: Array<{ data: unknown[]; ans?: unknown }>
  verifySource?: string
  reasoning?: string
}

export type ProblemAuthoringInput = {
  title?: string
  description?: string
  functionSignature?: string
  entryPoint?: string
  verifySource?: string
  testCases?: Array<{ data: unknown[]; ans?: unknown }>
  authoringMode?: AuthoringMode
  lockVerifySource?: boolean
  targetCount?: number
  existingCount?: number
}

export type AuthoringResponsePayload = {
  title?: string
  functionSignature?: string
  entryPoint?: string
  testCases?: Array<{ data: unknown[]; ans?: unknown }>
  verifySource?: string
  reasoning?: string
}

export type AuthoringResponseTestCase = NonNullable<AuthoringResponsePayload['testCases']>[number]
