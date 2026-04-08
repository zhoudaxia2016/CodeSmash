import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import { useAppStore } from '../stores/appStore'
import type { BattleSession } from '../types'

export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: () => api.getMe(),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  })
}

export function useModels() {
  const setModels = useAppStore((s) => s.setModels)
  return useQuery({
    queryKey: ['models'],
    queryFn: async () => {
      const data = await api.getModels()
      setModels(data.models)
      return data.models
    },
  })
}

export function useProblems() {
  const setProblems = useAppStore((s) => s.setProblems)
  return useQuery({
    queryKey: ['problems'],
    queryFn: async () => {
      const data = await api.getProblems()
      setProblems(data.problems)
      return data.problems
    },
  })
}

export function useProblem(id: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['problems', id],
    queryFn: () => api.getProblem(id),
    enabled: options?.enabled !== undefined ? options.enabled : !!id,
  })
}

export function useCreateProblem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: Parameters<typeof api.createProblem>[0]) => api.createProblem(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['problems'] })
    },
  })
}

export function useSuggestProblemAuthoring() {
  return useMutation({
    mutationFn: (body: Parameters<typeof api.suggestProblemAuthoring>[0]) =>
      api.suggestProblemAuthoring(body),
  })
}

export function useUpdateProblem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof api.updateProblem>[1] }) =>
      api.updateProblem(id, data),
    onSuccess: (_, { id }) => {
      void queryClient.invalidateQueries({ queryKey: ['problems', id] })
      void queryClient.invalidateQueries({ queryKey: ['problems'] })
    },
  })
}

export function useDeleteProblem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.deleteProblem(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['problems'] }),
  })
}

export function useGenerateTestCases() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (problemId: string) => api.generateTestCases(problemId),
    onSuccess: (_, problemId) => queryClient.invalidateQueries({ queryKey: ['problems', problemId] }),
  })
}

export function useCreateTestCase() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ problemId, data }: { problemId: string; data: Parameters<typeof api.createTestCase>[1] }) =>
      api.createTestCase(problemId, data),
    onSuccess: (_, { problemId }) => {
      void queryClient.invalidateQueries({ queryKey: ['problems', problemId] })
      void queryClient.invalidateQueries({ queryKey: ['problems'] })
    },
  })
}

export function useUpdateTestCase() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ problemId, testCaseId, data }: { problemId: string; testCaseId: string; data: Parameters<typeof api.updateTestCase>[2] }) =>
      api.updateTestCase(problemId, testCaseId, data),
    onSuccess: (_, { problemId }) => {
      void queryClient.invalidateQueries({ queryKey: ['problems', problemId] })
      void queryClient.invalidateQueries({ queryKey: ['problems'] })
    },
  })
}

export function useDeleteTestCase() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ problemId, testCaseId }: { problemId: string; testCaseId: string }) =>
      api.deleteTestCase(problemId, testCaseId),
    onSuccess: (_, { problemId }) => {
      void queryClient.invalidateQueries({ queryKey: ['problems', problemId] })
      void queryClient.invalidateQueries({ queryKey: ['problems'] })
    },
  })
}

export function useStartBattle() {
  const setBattleSession = useAppStore((s) => s.setBattleSession)
  return useMutation({
    mutationFn: ({ problemId, modelAId, modelBId }: { problemId: string; modelAId: string; modelBId: string }) =>
      api.startBattle(problemId, modelAId, modelBId),
    onSuccess: (session) => setBattleSession(session),
  })
}

type BattleQueryPayload = { battle: import('../types').BattleSession }

export function useBattle(battleId: string) {
  return useQuery({
    queryKey: ['battles', battleId],
    queryFn: () => api.getBattle(battleId),
    enabled: !!battleId,
    retry: 2,
    retryDelay: (attempt) => Math.min(1500 * 2 ** attempt, 8000),
    /** Interval refetch only runs while the tab is focused unless this is true. */
    refetchIntervalInBackground: true,
    refetchInterval: (query) => {
      /** `query.state.data` is the raw queryFn result, not `select` output. */
      const b = (query.state.data as BattleQueryPayload | undefined)?.battle
      if (!b) return false
      const active =
        b.status === 'pending' ||
        b.status === 'running' ||
        b.status === 'awaiting_client'
      return active ? 650 : false
    },
    select: (data) => data.battle,
  })
}

export function useLeaderboard(opts?: { problemId?: string; scope?: 'all' | 'mine' }) {
  const problemId = opts?.problemId
  const scope = opts?.scope ?? 'all'
  return useQuery({
    queryKey: ['leaderboard', problemId ?? '', scope],
    queryFn: () => api.getLeaderboard({ problemId, scope }),
  })
}

export function useBattleResults() {
  return useQuery({
    queryKey: ['battle-results'],
    queryFn: () => api.getBattleResults({ limit: 100 }),
    staleTime: 30_000,
  })
}

export function useBattleResultDetail(battleId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['battle-results', battleId],
    queryFn: () => api.getBattleResult(battleId),
    enabled: enabled && !!battleId,
    select: (data) => data.battle,
  })
}

export function useSyncBattleToCloud() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (battle: BattleSession) => api.postBattleResult(battle),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['battle-results'] })
      void queryClient.invalidateQueries({ queryKey: ['leaderboard'] })
    },
  })
}

export function useAdminModels(enabled: boolean) {
  return useQuery({
    queryKey: ['admin', 'models'],
    queryFn: () => api.getAdminModels(),
    enabled,
  })
}

export function useCreateAdminModel() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: Parameters<typeof api.createAdminModel>[0]) => api.createAdminModel(body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'models'] })
      void queryClient.invalidateQueries({ queryKey: ['models'] })
      void queryClient.invalidateQueries({ queryKey: ['leaderboard'] })
    },
  })
}

export function usePatchAdminModel() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Parameters<typeof api.patchAdminModel>[1] }) =>
      api.patchAdminModel(id, patch),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'models'] })
      void queryClient.invalidateQueries({ queryKey: ['models'] })
      void queryClient.invalidateQueries({ queryKey: ['leaderboard'] })
    },
  })
}

export function useDeleteAdminModel() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.deleteAdminModel(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'models'] })
      void queryClient.invalidateQueries({ queryKey: ['models'] })
      void queryClient.invalidateQueries({ queryKey: ['leaderboard'] })
    },
  })
}

export function useDeleteBattleResult() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (battleId: string) => api.deleteBattleResult(battleId),
    onSuccess: (_, battleId) => {
      void queryClient.invalidateQueries({ queryKey: ['battle-results'] })
      void queryClient.removeQueries({ queryKey: ['battle-results', battleId] })
    },
  })
}
