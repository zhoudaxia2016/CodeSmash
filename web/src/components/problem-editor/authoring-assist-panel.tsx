import { Sparkles } from 'lucide-react'
import type { GradingMode, PlatformModel } from '@/types'
import { Button } from '@/components/ui/button'

type Props = {
  models: PlatformModel[]
  authorModelId: string
  onAuthorModelIdChange: (id: string) => void
  /** 勾选＝辅助采用表单「标准答案 / 验证函数」；不勾选＝由模型自选判题方式。 */
  assistGradingFromForm: boolean
  onAssistGradingFromFormChange: (value: boolean) => void
  /** 生成模式：create（生成新用例）、append（追加用例）、fix（修正答案）。 */
  authoringMode: 'create' | 'append' | 'fix'
  onAuthoringModeChange: (mode: 'create' | 'append' | 'fix') => void
  /** 目标用例数。 */
  targetCount: number
  onTargetCountChange: (count: number) => void
  /** 现有用例数。 */
  existingCount: number
  /** 当前判题模式。 */
  gradingMode: GradingMode
  onSuggest: () => void
  pending: boolean
}

/** 命题辅助：模型选择与触发；具体请求与回填由 `useProblemAuthoringAssist` / `ProblemEditor` 编排。 */
export function ProblemAuthoringAssistPanel({
  models,
  authorModelId,
  onAuthorModelIdChange,
  assistGradingFromForm,
  onAssistGradingFromFormChange,
  authoringMode,
  onAuthoringModeChange,
  targetCount,
  onTargetCountChange,
  existingCount,
  gradingMode,
  onSuggest,
  pending,
}: Props) {
  const canUseFixMode = gradingMode === 'expected'
  const isFixMode = authoringMode === 'fix'

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
      
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
        <div className="flex items-center gap-3">
          <label className="flex cursor-pointer items-center gap-1.5">
            <input
              type="radio"
              name="authoringMode"
              value="create"
              checked={authoringMode === 'create'}
              onChange={() => onAuthoringModeChange('create')}
              className="h-3.5 w-3.5"
            />
            <span>生成新用例</span>
          </label>
          <label className="flex cursor-pointer items-center gap-1.5">
            <input
              type="radio"
              name="authoringMode"
              value="append"
              checked={authoringMode === 'append'}
              onChange={() => onAuthoringModeChange('append')}
              className="h-3.5 w-3.5"
            />
            <span>追加用例</span>
          </label>
          <label className={`flex cursor-pointer items-center gap-1.5 ${!canUseFixMode ? 'opacity-50' : ''}`}>
            <input
              type="radio"
              name="authoringMode"
              value="fix"
              checked={authoringMode === 'fix'}
              onChange={() => canUseFixMode && onAuthoringModeChange('fix')}
              disabled={!canUseFixMode}
              className="h-3.5 w-3.5"
            />
            <span>修正答案{!canUseFixMode && ' (仅标准答案模式)'}</span>
          </label>
        </div>

        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1">
            <span className="text-muted-foreground">
              {isFixMode ? '重算：' : authoringMode === 'append' ? '追加：' : '目标：'}
            </span>
            <input
              type="number"
              min={1}
              max={20}
              value={isFixMode ? existingCount : targetCount}
              onChange={(e) => {
                if (isFixMode) return
                const val = parseInt(e.target.value) || 1
                onTargetCountChange(Math.min(20, Math.max(1, val)))
              }}
              disabled={isFixMode}
              className="h-7 w-16 rounded border border-input bg-background px-2 text-xs disabled:opacity-50"
            />
            <span>条</span>
          </label>
        </div>

        <label className={`flex cursor-pointer items-center gap-1.5 ${isFixMode ? 'opacity-50' : ''}`}>
          <input
            type="checkbox"
            className="h-3.5 w-3.5 shrink-0 rounded border-input"
            checked={isFixMode ? true : assistGradingFromForm}
            onChange={(e) => !isFixMode && onAssistGradingFromFormChange(e.target.checked)}
            disabled={isFixMode}
          />
          <span className="text-muted-foreground">与表单一致</span>
        </label>
      </div>
    </div>
  )
}
