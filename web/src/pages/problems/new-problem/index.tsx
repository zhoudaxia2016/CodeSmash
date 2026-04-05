import { useCreateProblem } from '@/hooks/useApi'
import type { PlatformModel } from '@/types'
import { ProblemEditor, type ProblemEditorProps } from '@/components/problem-editor'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  models: PlatformModel[]
  defaultModelId: string
  /** 全库标签，用于标签输入快捷选择 */
  tagSuggestions?: string[]
  onCreated: (problemId: string) => void
}

/** Problems 专用：仅挂载 `ProblemEditor` 新建流，与 Battle 解耦以便后续各自演进。 */
export function NewProblem(props: Props) {
  const create = useCreateProblem()

  return (
    <ProblemEditor
      open={props.open}
      onOpenChange={props.onOpenChange}
      title="新建题目"
      titleId="problems-new-problem-title"
      mode="create"
      models={props.models}
      defaultModelId={props.defaultModelId}
      tagSuggestions={props.tagSuggestions}
      onCancel={() => props.onOpenChange(false)}
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
        props.onCreated(res.problem.id)
      }}
    />
  )
}
