import { X } from 'lucide-react'
import type { PlatformModel } from '@/types'
import { Button } from '@/components/ui/button'
import { CreateProblem } from '@/components/create-problem'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  models: PlatformModel[]
  defaultModelId: string
  onCreated: (problemId: string) => void
}

/** Battle 页内新建题目的全屏层（具体布局由样式实现，命名不绑定某种 UI 形态）。 */
export function NewProblem({
  open,
  onOpenChange,
  models,
  defaultModelId,
  onCreated,
}: Props) {
  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="battle-new-problem-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        aria-label="关闭"
        onClick={() => onOpenChange(false)}
      />
      <div className="relative z-10 flex max-h-[min(92vh,820px)] w-full max-w-4xl flex-col rounded-t-xl border border-border bg-card shadow-lg sm:max-h-[90vh] sm:rounded-xl">
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h2
              id="battle-new-problem-title"
              className="text-base font-semibold tracking-tight text-foreground"
            >
              新建题目
            </h2>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={() => onOpenChange(false)}
            aria-label="关闭"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col">
          <CreateProblem
            models={models}
            defaultModelId={defaultModelId}
            onCreated={(id) => {
              onCreated(id)
              onOpenChange(false)
            }}
            onCancel={() => onOpenChange(false)}
            contentClassName="px-5 py-4"
            footerClassName="px-5 pb-3"
          />
        </div>
      </div>
    </div>
  )
}
