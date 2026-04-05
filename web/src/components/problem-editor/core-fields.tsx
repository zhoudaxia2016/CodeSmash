import { useId } from 'react'
import type { GradingMode } from '@/types'
import { TagInput } from '@/components/ui/tag-input'

type Props = {
  variant: 'create' | 'edit'
  title: string
  onTitleChange: (v: string) => void
  description: string
  onDescriptionChange: (v: string) => void
  tags: string[]
  onTagsChange: (tags: string[]) => void
  functionSignature: string
  onFunctionSignatureChange: (v: string) => void
  entryPoint: string
  onEntryPointChange: (v: string) => void
}

/** 标题、描述、标签、签名、入口 — 新建与编辑共用。 */
export function ProblemFormFields({
  variant,
  title,
  onTitleChange,
  description,
  onDescriptionChange,
  tags,
  onTagsChange,
  functionSignature,
  onFunctionSignatureChange,
  entryPoint,
  onEntryPointChange,
}: Props) {
  const descriptionField = (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-muted-foreground">
        {variant === 'create' ? '题目描述（题干）' : '题目描述'}
      </span>
      <textarea
        className={
          variant === 'create'
            ? 'min-h-[11rem] w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm leading-relaxed text-foreground'
            : 'min-h-[6rem] w-full resize-y rounded-md border border-input bg-background px-2 py-1.5 text-sm leading-relaxed'
        }
        rows={variant === 'create' ? 10 : 6}
        value={description}
        onChange={(e) => onDescriptionChange(e.target.value)}
        placeholder={variant === 'create' ? '完整题目要求：输入输出说明、约束、示例等…' : undefined}
      />
    </label>
  )

  const titleField = (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-muted-foreground">标题</span>
      {variant === 'create' && (
        <p className="text-[11px] text-muted-foreground">可先留空，使用「大模型辅助」后自动补全短标题。</p>
      )}
      <input
        className={
          variant === 'create'
            ? 'mt-0.5 w-full rounded-md border border-input bg-background px-2 py-1.5 text-foreground'
            : 'w-full rounded-md border border-input bg-background px-2 py-1.5 text-foreground'
        }
        value={title}
        onChange={(e) => onTitleChange(e.target.value)}
        placeholder={variant === 'create' ? '例如：两数之和' : undefined}
      />
    </label>
  )

  return (
    <div className="space-y-3 text-sm">
      {variant === 'create' ? (
        <>
          {descriptionField}
          {titleField}
        </>
      ) : (
        <>
          {titleField}
          {descriptionField}
        </>
      )}
      <div className="space-y-1">
        <span className="text-xs font-medium text-muted-foreground">标签</span>
        {variant === 'create' && (
          <p className="text-[11px] text-muted-foreground">
            输入后按 Enter 添加；也可用英文/中文逗号一次输入多个。
          </p>
        )}
        <TagInput
          value={tags}
          onChange={onTagsChange}
          placeholder={variant === 'create' ? '数组' : '标签'}
          aria-label="题目标签"
        />
      </div>
      <label className="block space-y-1">
        <span className="text-xs font-medium text-muted-foreground">函数签名</span>
        {variant === 'create' && (
          <p className="text-[11px] text-muted-foreground">可留空，由大模型根据题干生成。</p>
        )}
        <textarea
          className={
            variant === 'create'
              ? 'mt-0.5 w-full rounded-md border border-input bg-background px-2 py-1.5 font-mono text-xs text-foreground'
              : 'min-h-[3rem] w-full rounded-md border border-input bg-background px-2 py-1.5 font-mono text-xs'
          }
          rows={2}
          value={functionSignature}
          onChange={(e) => onFunctionSignatureChange(e.target.value)}
          placeholder={
            variant === 'create'
              ? '例如：function twoSum(nums: number[], target: number): number[]'
              : undefined
          }
        />
      </label>
      <label className="block space-y-1">
        <span className="text-xs font-medium text-muted-foreground">入口函数名</span>
        <input
          className="w-full rounded-md border border-input bg-background px-2 py-1.5 font-mono text-xs"
          value={entryPoint}
          onChange={(e) => onEntryPointChange(e.target.value)}
          placeholder={variant === 'create' ? '与签名中的函数名一致' : undefined}
        />
      </label>
    </div>
  )
}

type GradingProps = {
  gradingMode: GradingMode
  onGradingModeChange: (m: GradingMode) => void
  verifySource: string
  onVerifySourceChange: (v: string) => void
  /** 默认同新建流高度；编辑流可传更矮的 min-height class */
  verifyMinHeightClass?: string
}

/** 判题方式 + verify 源码，新建与编辑共用。 */
export function ProblemGradingBlock({
  gradingMode,
  onGradingModeChange,
  verifySource,
  onVerifySourceChange,
  verifyMinHeightClass = 'min-h-[8rem]',
}: GradingProps) {
  const gradingName = useId()
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">判题</span>
        <label className="flex items-center gap-1.5 text-xs">
          <input
            type="radio"
            name={gradingName}
            checked={gradingMode === 'expected'}
            onChange={() => onGradingModeChange('expected')}
          />
          标准答案
        </label>
        <label className="flex items-center gap-1.5 text-xs">
          <input
            type="radio"
            name={gradingName}
            checked={gradingMode === 'verify'}
            onChange={() => onGradingModeChange('verify')}
          />
          验证函数
        </label>
      </div>
      {gradingMode === 'verify' && (
        <label className="block space-y-1">
          <span className="text-xs font-medium text-muted-foreground">verify 源码</span>
          <textarea
            className={`w-full rounded-md border border-input bg-background px-2 py-1.5 font-mono text-xs ${verifyMinHeightClass}`}
            value={verifySource}
            onChange={(e) => onVerifySourceChange(e.target.value)}
            placeholder={'function verify(...args, candidate) {\n  return false;\n}'}
          />
        </label>
      )}
    </>
  )
}
