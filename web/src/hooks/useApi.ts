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

export function useProblem(id: string) {
  return useQuery({
    queryKey: ['problems', id],
    queryFn: () => api.getProblem(id),
    enabled: !!id,
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

export function useTestCases(problemId: string) {
  return useQuery({
    queryKey: ['testCases', problemId],
    queryFn: () => api.getTestCases(problemId),
    enabled: !!problemId,
  })
}

export function useGenerateTestCases() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (problemId: string) => api.generateTestCases(problemId),
    onSuccess: (_, problemId) => queryClient.invalidateQueries({ queryKey: ['testCases', problemId] }),
  })
}

export function useCreateTestCase() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ problemId, data }: { problemId: string; data: Parameters<typeof api.createTestCase>[1] }) =>
      api.createTestCase(problemId, data),
    onSuccess: (_, { problemId }) => queryClient.invalidateQueries({ queryKey: ['testCases', problemId] }),
  })
}

export function useUpdateTestCase() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ problemId, testCaseId, data }: { problemId: string; testCaseId: string; data: Parameters<typeof api.updateTestCase>[2] }) =>
      api.updateTestCase(problemId, testCaseId, data),
    onSuccess: (_, { problemId }) => queryClient.invalidateQueries({ queryKey: ['testCases', problemId] }),
  })
}

export function useDeleteTestCase() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ problemId, testCaseId }: { problemId: string; testCaseId: string }) =>
      api.deleteTestCase(problemId, testCaseId),
    onSuccess: (_, { problemId }) => queryClient.invalidateQueries({ queryKey: ['testCases', problemId] }),
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

export function useBattle(battleId: string) {
  return useQuery({
    queryKey: ['battles', battleId],
    queryFn: () => api.getBattle(battleId),
    enabled: !!battleId,
    refetchInterval: (query) => query.state.data?.battle?.status === 'running' || query.state.data?.battle?.status === 'pending' ? 2000 : false,
    select: (data) => data.battle,
  })
}

export function useLeaderboard(problemId?: string) {
  return useQuery({
    queryKey: ['leaderboard', problemId],
    queryFn: () => api.getLeaderboard(problemId),
  })
}
