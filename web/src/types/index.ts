export interface PlatformModel {
  id: string
  name: string
  description?: string
  provider: string
  enabled: boolean
}

/** Full row from GET /admin/models (includes disabled). */
export type AdminPlatformModel = {
  id: string
  name: string
  description: string
  provider: string
  enabled: boolean
  sortOrder: number
  createdAt: string
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
  /** When `gradingMode === 'expected'`: JSON array of acceptable return values. */
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

/** Row from GET /battle-results (list). */
export interface BattleResultListItem {
  id: string
  problemId: string
  modelAId: string
  modelBId: string
  createdAt: string
  status: string | null
  completedAt: string | null
  creator: Pick<AuthUser, 'id' | 'login' | 'name' | 'avatarUrl'>
}

/** Single model-side battle round; server streams into `result[last]`. */
export type ModelSideStatus =
  | 'pending'
  | 'thinking'
  | 'coding'
  | 'selfTesting'
  | 'running'
  | 'completed'
  | 'failed'
  | 'error'
  | 'timeout'

export interface ModelRound {
  /** 由追问创建该轮时，用户输入的原文（用于服务端多轮对话回放）。首轮无此字段。 */
  refineUserMessage?: string
  thought?: string
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
  phase: ModelPhase
  status: ModelSideStatus
}

/** Per-model battle output: only `modelId` + `result[]` (last item is current round). */
export interface ModelResult {
  modelId: string
  result: ModelRound[]
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
