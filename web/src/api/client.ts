import type { RateLimitInfo } from '../types'

const API_BASE = '/api'

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Unknown error' }))
    throw new Error(error.message || `HTTP ${response.status}`)
  }
  return response.json()
}

export const api = {
  async getModels(): Promise<{ models: import('../types').PlatformModel[] }> {
    const res = await fetch(`${API_BASE}/models`)
    return handleResponse(res)
  },

  async getProblems(): Promise<{ problems: import('../types').Problem[] }> {
    const res = await fetch(`${API_BASE}/problems`)
    return handleResponse(res)
  },

  async getProblem(id: string): Promise<import('../types').Problem> {
    const res = await fetch(`${API_BASE}/problems/${id}`)
    return handleResponse(res)
  },

  async createProblem(data: Omit<import('../types').Problem, 'id' | 'createdAt' | 'updatedAt'>): Promise<import('../types').Problem> {
    const res = await fetch(`${API_BASE}/problems`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    return handleResponse(res)
  },

  async updateProblem(id: string, data: Partial<import('../types').Problem>): Promise<import('../types').Problem> {
    const res = await fetch(`${API_BASE}/problems/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    return handleResponse(res)
  },

  async deleteProblem(id: string): Promise<void> {
    const res = await fetch(`${API_BASE}/problems/${id}`, { method: 'DELETE' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
  },

  async getTestCases(problemId: string): Promise<{ testCases: import('../types').TestCase[] }> {
    const res = await fetch(`${API_BASE}/problems/${problemId}/test-cases`)
    return handleResponse(res)
  },

  async createTestCase(problemId: string, data: Omit<import('../types').TestCase, 'id' | 'problemId'>): Promise<import('../types').TestCase> {
    const res = await fetch(`${API_BASE}/problems/${problemId}/test-cases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    return handleResponse(res)
  },

  async generateTestCases(problemId: string): Promise<{ testCases: import('../types').TestCase[] }> {
    const res = await fetch(`${API_BASE}/problems/${problemId}/test-cases/generate`, { method: 'POST' })
    return handleResponse(res)
  },

  async updateTestCase(problemId: string, testCaseId: string, data: Partial<import('../types').TestCase>): Promise<import('../types').TestCase> {
    const res = await fetch(`${API_BASE}/problems/${problemId}/test-cases/${testCaseId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    return handleResponse(res)
  },

  async deleteTestCase(problemId: string, testCaseId: string): Promise<void> {
    const res = await fetch(`${API_BASE}/problems/${problemId}/test-cases/${testCaseId}`, { method: 'DELETE' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
  },

  async startBattle(problemId: string, modelAId: string, modelBId: string): Promise<import('../types').BattleSession> {
    const res = await fetch(`${API_BASE}/battles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ problemId, modelAId, modelBId }),
    })
    return handleResponse(res)
  },

  async getBattle(battleId: string): Promise<{ battle: import('../types').BattleSession }> {
    const res = await fetch(`${API_BASE}/battles/${battleId}`)
    return handleResponse(res)
  },

  async pollBattle(battleId: string, intervalMs?: number): Promise<{ battle: import('../types').BattleSession }> {
    const res = await fetch(`${API_BASE}/battles/${battleId}/poll?interval=${intervalMs || 1000}`)
    return handleResponse(res)
  },

  async getLeaderboard(problemId?: string): Promise<{ entries: import('../types').LeaderboardEntry[] }> {
    const url = problemId ? `${API_BASE}/leaderboard?problemId=${problemId}` : `${API_BASE}/leaderboard`
    const res = await fetch(url)
    return handleResponse(res)
  },

  async getRateLimit(): Promise<RateLimitInfo> {
    const res = await fetch(`${API_BASE}/rate-limit`)
    return handleResponse(res)
  },
}
