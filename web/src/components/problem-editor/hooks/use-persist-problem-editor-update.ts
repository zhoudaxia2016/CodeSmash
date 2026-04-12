import { useQueryClient } from '@tanstack/react-query'
import type { ProblemEditorProps } from '@/components/problem-editor'
import { api } from '@/api/client'

export function usePersistProblemEditorUpdate() {
  const queryClient = useQueryClient()

  return async (
    args: Parameters<NonNullable<ProblemEditorProps['onConfirm']>>[0],
  ) => {
    if (args.kind !== 'update') return
    const pid = args.problemId
    await api.saveProblem(pid, {
      problem: args.problem,
      testCaseDeletes: args.testCaseDeletes,
      testCaseUpdates: args.testCaseUpdates,
      testCaseCreates: args.testCaseCreates,
    })
    await queryClient.invalidateQueries({ queryKey: ['problems', pid] })
    await queryClient.invalidateQueries({ queryKey: ['problems'] })
  }
}
