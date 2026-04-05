import { useCreateProblem } from '@/hooks/useApi'
import type { PlatformModel } from '@/types'
import { ProblemEditor, type ProblemEditorProps } from '@/components/problem-editor'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  models: PlatformModel[]
  defaultModelId: string
  onCreated: (problemId: string) => void
}

export function NewProblem({
  open,
  onOpenChange,
  models,
  defaultModelId,
  onCreated,
}: Props) {
  const create = useCreateProblem()

  return (
    <ProblemEditor
      open={open}
      onOpenChange={onOpenChange}
      title="新建题目"
      titleId="battle-new-problem-title"
      mode="create"
      models={models}
      defaultModelId={defaultModelId}
      onCancel={() => onOpenChange(false)}
      submitLabel="保存题目"
      onConfirm={async (args: Parameters<NonNullable<ProblemEditorProps['onConfirm']>>[0]) => {
        if (args.kind !== 'create') return
        const p = args.problem
        const res = await create.mutateAsync({
          title: p.title,
          description: p.description,
          tags: p.tags,
          entryPoint: p.entryPoint,
          functionSignature: p.functionSignature,
          gradingMode: p.gradingMode,
          verifySource: p.verifySource,
          testCases: p.testCases,
        })
        onCreated(res.problem.id)
      }}
    />
  )
}
