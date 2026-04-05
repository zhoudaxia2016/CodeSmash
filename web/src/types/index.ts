export interface PlatformModel {
  id: string
  name: string
  description?: string
  provider: string
  enabled: boolean
}

export type GradingMode = 'expected' | 'verify'

export interface Problem {
  id: string
  title: string
  description: string
  tags?: string[]
  entryPoint: string
  functionSignature: string
  gradingMode: GradingMode
  verifySource?: string | null
  referenceNote?: string
  /** Local user id when created by a logged-in user. */
  createdBy?: string | null
  createdAt: string
  updatedAt: string
}

export type AuthUser = {
  id: string
  login: string
  name: string | null
  avatarUrl: string | null
  role: string
}

export interface TestCase {
  id: string
  problemId: string
  /** Arguments passed as `entryPoint.apply(null, data)`. */
  data: unknown[]
  /** Expected value when `gradingMode === 'expected'`. */
  ans?: unknown
  /** Derived display string (JSON of `data`). */
  input: string
  /** Derived display string for expected mode. */
  expectedOutput: string
}

export type ModelPhase =
  | 'pending'
  | 'analyzing'
  | 'coding'
  | 'awaiting_execution'
  | 'running_tests'
  | 'failed'
  | 'completed'

export interface BattleSession {
  id: string
  problemId: string
  modelAId: string
  modelBId: string
  status: 'pending' | 'running' | 'awaiting_client' | 'completed' | 'partial' | 'failed'
  modelAResult?: ModelResult
  modelBResult?: ModelResult
  createdAt: string
  completedAt?: string
}

export interface ModelResult {
  modelId: string
  status: 'pending' | 'thinking' | 'coding' | 'selfTesting' | 'running' | 'completed' | 'failed' | 'error' | 'timeout'
  /** Server-driven LLM + client test pipeline stage */
  phase?: ModelPhase
  thought?: string
  /** Server-split code-phase reasoning; when absent, UI derives from `code` via heuristics. */
  codingThought?: string
  code?: string
  selfTestCases?: SelfTestCase[]
  selfTestConclusion?: string
  officialResult?: {
    passed: number
    total: number
    timeMs: number
    details?: TestResult[]
  }
  error?: string
  /** 模型输出耗时 = 分析 + 生成代码 */
  timeMs?: number
  analysisTimeMs?: number
  codingTimeMs?: number
}

export interface SelfTestCase {
  input: string
  expectedOutput: string
  actualOutput?: string
  passed?: boolean
}

export interface TestResult {
  testCaseId: string
  input: string
  expectedOutput: string
  actualOutput: string
  passed: boolean
  timeMs?: number
}

export interface LeaderboardEntry {
  modelId: string
  modelName: string
  problemId?: string
  global: boolean
  passRate: number
  avgTimeMs: number
  battleCount: number
  selfTestQuality: number
}

export interface RateLimitInfo {
  remaining: number
  limit: number
  resetAt: string
}

/** Browser-side grading context for QuickJS (from GET /problems/:id). */
export type ProblemGradingContext = Pick<Problem, 'entryPoint' | 'gradingMode' | 'verifySource'>

export type ProblemAuthoringResponse = {
  title?: string
  functionSignature?: string
  entryPoint: string
  gradingMode: GradingMode
  testCases: Array<{ data: unknown[]; ans?: unknown }>
  verifySource?: string | null
  reasoning?: string
}
