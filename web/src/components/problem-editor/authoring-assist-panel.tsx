import { Sparkles } from 'lucide-react'
import type { PlatformModel } from '@/types'
import { Button } from '@/components/ui/button'

type Props = {
  models: PlatformModel[]
  authorModelId: string
  onAuthorModelIdChange: (id: string) => void
  /** 勾选后辅助输出必须采用表单中的判题方式（expected / verify）。 */
  enforceFormGradingMode: boolean
  onEnforceFormGradingModeChange: (value: boolean) => void
  onSuggest: () => void
  pending: boolean
}

/** 命题辅助：模型选择与触发；具体请求与回填由 `useProblemAuthoringAssist` / `ProblemEditor` 编排。 */
export function ProblemAuthoringAssistPanel({
  models,
  authorModelId,
  onAuthorModelIdChange,
  enforceFormGradingMode,
  onEnforceFormGradingModeChange,
  onSuggest,
  pending,
}: Props) {
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
      <label className="flex cursor-pointer items-start gap-2 text-[11px] leading-snug text-foreground">
        <input
          type="checkbox"
          className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-input"
          checked={enforceFormGradingMode}
          onChange={(e) => onEnforceFormGradingModeChange(e.target.checked)}
        />
        <span>
          <span className="font-medium text-foreground/90">自动选择判题类型</span>
          <span className="text-muted-foreground">
            {' '}
            — 勾选后辅助结果固定为上方「判题」中的 expected / verify；不勾选则由模型根据题意自选。
          </span>
        </span>
      </label>
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        <span className="font-medium text-foreground/90">大模型辅助：</span>
        通常只需写好题干即可；标签与用例可留空。用例也可先手写几条再让模型补全判题方式。保存前请人工核对。
      </p>
    </div>
  )
}
