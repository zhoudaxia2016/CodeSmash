import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import { useAppStore } from '../stores/appStore'

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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['problems'] }),
  })
}

export function useUpdateProblem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof api.updateProblem>[1] }) =>
      api.updateProblem(id, data),
    onSuccess: (_, { id }) => queryClient.invalidateQueries({ queryKey: ['problems', id] }),
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
    onSuccess: (_, { problemId }) => queryClient.invalidateQueries({ queryKey: ['problems', problemId] }),
  })
}

export function useUpdateTestCase() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ problemId, testCaseId, data }: { problemId: string; testCaseId: string; data: Parameters<typeof api.updateTestCase>[2] }) =>
      api.updateTestCase(problemId, testCaseId, data),
    onSuccess: (_, { problemId }) => queryClient.invalidateQueries({ queryKey: ['problems', problemId] }),
  })
}

export function useDeleteTestCase() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ problemId, testCaseId }: { problemId: string; testCaseId: string }) =>
      api.deleteTestCase(problemId, testCaseId),
    onSuccess: (_, { problemId }) => queryClient.invalidateQueries({ queryKey: ['problems', problemId] }),
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

export function useLeaderboard(problemId?: string) {
  return useQuery({
    queryKey: ['leaderboard', problemId],
    queryFn: () => api.getLeaderboard(problemId),
  })
}
