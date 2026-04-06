import type { AuthUser, RateLimitInfo } from '../types'

const rawApiOrigin =
  import.meta.env.VITE_API_URL?.trim().replace(/\/$/, '') ?? ''
const API_BASE = rawApiOrigin ? `${rawApiOrigin}/api` : '/api'

function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const method = (init?.method ?? 'GET').toUpperCase()
  const headers = new Headers(init?.headers)
  if (
    (method === 'POST' || method === 'PATCH' || method === 'PUT') &&
    !headers.has('Content-Type')
  ) {
    headers.set('Content-Type', 'application/json')
  }
  return fetch(path, { ...init, credentials: 'include', headers })
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error = (await response.json().catch(() => ({}))) as {
      message?: string
      error?: string
    }
    const msg =
      (typeof error.message === 'string' && error.message) ||
      (typeof error.error === 'string' && error.error) ||
      `HTTP ${response.status}`
    throw new Error(msg)
  }
  return response.json()
}

export const api = {
  async getMe(): Promise<{ user: AuthUser | null }> {
    const res = await apiFetch(`${API_BASE}/auth/me`)
    return handleResponse(res)
  },

  async logout(): Promise<void> {
    const res = await apiFetch(`${API_BASE}/auth/logout`, { method: 'POST' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
  },

  async postBattleResult(battle: import('../types').BattleSession): Promise<{ ok: boolean; id: string }> {
    const res = await apiFetch(`${API_BASE}/battle-results`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ battle }),
    })
    return handleResponse(res)
  },

  async getBattleResults(params?: { limit?: number; offset?: number }): Promise<{
    items: import('../types').BattleResultListItem[]
  }> {
    const q = new URLSearchParams()
    if (params?.limit != null) q.set('limit', String(params.limit))
    if (params?.offset != null) q.set('offset', String(params.offset))
    const qs = q.toString()
    const res = await apiFetch(`${API_BASE}/battle-results${qs ? `?${qs}` : ''}`)
    return handleResponse(res)
  },

  async getBattleResult(id: string): Promise<{ battle: import('../types').BattleSession }> {
    const res = await apiFetch(`${API_BASE}/battle-results/${encodeURIComponent(id)}`)
    return handleResponse(res)
  },

  async deleteBattleResult(id: string): Promise<{ ok: boolean }> {
    const res = await apiFetch(`${API_BASE}/battle-results/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    })
    return handleResponse(res)
  },

  async getAdminModels(): Promise<{ message: string; items: unknown[] }> {
    const res = await apiFetch(`${API_BASE}/admin/models`)
    return handleResponse(res)
  },

  async getAdminLogs(): Promise<{ message: string; items: unknown[] }> {
    const res = await apiFetch(`${API_BASE}/admin/logs`)
    return handleResponse(res)
  },

  async getModels(): Promise<{ models: import('../types').PlatformModel[] }> {
    const res = await apiFetch(`${API_BASE}/models`)
    return handleResponse(res)
  },

  async getProblems(): Promise<{ problems: import('../types').Problem[] }> {
    const res = await apiFetch(`${API_BASE}/problems`)
    return handleResponse(res)
  },

  async getProblem(id: string): Promise<{
    problem: import('../types').Problem
    testCases: import('../types').TestCase[]
  }> {
    const res = await apiFetch(`${API_BASE}/problems/${id}`)
    return handleResponse(res)
  },

  async createProblem(
    data: Omit<import('../types').Problem, 'id' | 'createdAt' | 'updatedAt'> & {
      testCases?: Array<{
        data: unknown[]
        ans?: unknown
      }>
    },
  ): Promise<{ problem: import('../types').Problem; testCases: import('../types').TestCase[] }> {
    const res = await apiFetch(`${API_BASE}/problems`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    return handleResponse(res)
  },

  async suggestProblemAuthoring(body: {
    title?: string
    description?: string
    functionSignature?: string
    testCasesData?: unknown[][]
    tags?: string[]
    modelId?: string
    /** 当前表单判题方式（与是否强制无关，便于服务端与调试）。 */
    formGradingMode?: import('../types').GradingMode
    /** 为 true 时辅助与表单判题方式（formGradingMode）一致。 */
    assistGradingFromForm?: boolean
  }): Promise<import('../types').ProblemAuthoringResponse> {
    const res = await apiFetch(`${API_BASE}/problems/authoring`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    return handleResponse(res)
  },

  async updateProblem(id: string, data: Partial<import('../types').Problem>): Promise<import('../types').Problem> {
    const res = await apiFetch(`${API_BASE}/problems/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    return handleResponse(res)
  },

  async deleteProblem(id: string): Promise<void> {
    const res = await apiFetch(`${API_BASE}/problems/${id}`, { method: 'DELETE' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
  },

  async createTestCase(problemId: string, data: Omit<import('../types').TestCase, 'id' | 'problemId'>): Promise<import('../types').TestCase> {
    const res = await apiFetch(`${API_BASE}/problems/${problemId}/test-cases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    return handleResponse(res)
  },

  async generateTestCases(problemId: string): Promise<{ testCases: import('../types').TestCase[] }> {
    const res = await apiFetch(`${API_BASE}/problems/${problemId}/test-cases/generate`, { method: 'POST' })
    return handleResponse(res)
  },

  async updateTestCase(problemId: string, testCaseId: string, data: Partial<import('../types').TestCase>): Promise<import('../types').TestCase> {
    const res = await apiFetch(`${API_BASE}/problems/${problemId}/test-cases/${testCaseId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    return handleResponse(res)
  },

  async deleteTestCase(problemId: string, testCaseId: string): Promise<void> {
    const res = await apiFetch(`${API_BASE}/problems/${problemId}/test-cases/${testCaseId}`, { method: 'DELETE' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
  },

  async startBattle(problemId: string, modelAId: string, modelBId: string): Promise<import('../types').BattleSession> {
    const res = await apiFetch(`${API_BASE}/battles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ problemId, modelAId, modelBId }),
    })
    const data = await handleResponse<{ battle: import('../types').BattleSession }>(res)
    return data.battle
  },

  async getBattle(battleId: string): Promise<{ battle: import('../types').BattleSession }> {
    const res = await apiFetch(`${API_BASE}/battles/${battleId}`)
    return handleResponse(res)
  },

  async resumeBattle(battleId: string): Promise<{ battle: import('../types').BattleSession }> {
    const res = await apiFetch(`${API_BASE}/battles/resume/${encodeURIComponent(battleId)}`, {
      method: 'POST',
    })
    return handleResponse(res)
  },

  async submitBattleOfficial(
    battleId: string,
    payload: {
      side: 'modelA' | 'modelB'
      officialResult: {
        passed: number
        total: number
        timeMs: number
        details: import('../types').TestResult[]
      }
    },
  ): Promise<{ battle: import('../types').BattleSession }> {
    const res = await apiFetch(`${API_BASE}/battles/${battleId}/official`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    return handleResponse(res)
  },

  async refineBattle(
    battleId: string,
    payload: {
      side: 'modelA' | 'modelB'
      userMessage?: string
      includeFailedCases?: boolean
    },
  ): Promise<{ battle: import('../types').BattleSession }> {
    const res = await apiFetch(`${API_BASE}/battles/${battleId}/refine`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    return handleResponse(res)
  },

  async pollBattle(battleId: string, intervalMs?: number): Promise<{ battle: import('../types').BattleSession }> {
    const res = await apiFetch(`${API_BASE}/battles/${battleId}/poll?interval=${intervalMs || 1000}`)
    return handleResponse(res)
  },

  async getLeaderboard(problemId?: string): Promise<{ entries: import('../types').LeaderboardEntry[] }> {
    const url = problemId ? `${API_BASE}/leaderboard?problemId=${problemId}` : `${API_BASE}/leaderboard`
    const res = await apiFetch(url)
    return handleResponse(res)
  },

  async getRateLimit(): Promise<RateLimitInfo> {
    const res = await apiFetch(`${API_BASE}/rate-limit`)
    return handleResponse(res)
  },
}
