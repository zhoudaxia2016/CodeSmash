export interface PlatformModel {
  id: string
  name: string
  description?: string
  provider: string
  enabled: boolean
}

export interface Problem {
  id: string
  title: string
  description: string
  difficulty?: 'easy' | 'medium' | 'hard'
  tags?: string[]
  entryPoint: string
  functionSignature: string
  referenceNote?: string
  createdAt: string
  updatedAt: string
}

export interface TestCase {
  id: string
  problemId: string
  input: string
  expectedOutput: string
  enabled: boolean
  source: 'manual' | 'generated'
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
