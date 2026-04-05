import { Sparkles } from 'lucide-react'
import type { PlatformModel } from '@/types'
import { Button } from '@/components/ui/button'

/**
 * 命题辅助的纯 UI：模型选择与触发按钮。
 * 调用 API 与回填表单的逻辑在 `useProblemAuthoringAssist`（及父组件的 onSuccess）中。
 */
export function ProblemAuthoringAssistPanel({
  models,
  authorModelId,
  onAuthorModelIdChange,
  onSuggest,
  pending,
}: {
  models: PlatformModel[]
  authorModelId: string
  onAuthorModelIdChange: (id: string) => void
  onSuggest: () => void
  pending: boolean
}) {
  return (
    <div className="space-y-2 border-t border-border pt-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-[8rem] flex-1 space-y-1">
          <span className="text-xs font-medium text-muted-foreground">辅助模型</span>
          <select
            className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground"
            value={authorModelId}
            onChange={(e) => onAuthorModelIdChange(e.target.value)}
          >
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5"
          disabled={pending}
          onClick={onSuggest}
        >
          <Sparkles className="h-3.5 w-3.5" />
          {pending ? '生成中…' : '大模型辅助'}
        </Button>
      </div>
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        <span className="font-medium text-foreground/90">大模型辅助：</span>
        通常只需写好题干即可；标签与用例可留空。用例也可先手写几条再让模型补全判题方式。保存前请人工核对。
      </p>
    </div>
  )
}
