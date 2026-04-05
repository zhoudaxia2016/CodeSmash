import { useQueryClient } from '@tanstack/react-query'
import type { ProblemEditorProps } from '@/components/problem-editor'
import {
  useCreateTestCase,
  useDeleteTestCase,
  useUpdateProblem,
  useUpdateTestCase,
} from '@/hooks/useApi'

export function usePersistProblemEditorUpdate() {
  const queryClient = useQueryClient()
  const updateProblem = useUpdateProblem()
  const createTc = useCreateTestCase()
  const updateTc = useUpdateTestCase()
  const deleteTc = useDeleteTestCase()

  return async (
    args: Parameters<NonNullable<ProblemEditorProps['onConfirm']>>[0],
  ) => {
    if (args.kind !== 'update') return
    const pid = args.problemId
    await updateProblem.mutateAsync({ id: pid, data: args.problem })
    for (const id of args.testCaseDeletes) {
      await deleteTc.mutateAsync({ problemId: pid, testCaseId: id })
    }
    for (const u of args.testCaseUpdates) {
      await updateTc.mutateAsync({
        problemId: pid,
        testCaseId: u.testCaseId,
        data: { data: u.data, ans: u.ans },
      })
    }
    for (const c of args.testCaseCreates) {
      await createTc.mutateAsync({
        problemId: pid,
        data: {
          data: c.data,
          ans: c.ans,
          input: JSON.stringify(c.data),
          expectedOutput: c.ans !== undefined ? JSON.stringify(c.ans) : '',
        },
      })
    }
    await queryClient.invalidateQueries({ queryKey: ['problems', pid] })
    await queryClient.invalidateQueries({ queryKey: ['problems'] })
  }
}
