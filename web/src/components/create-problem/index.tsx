import { useState, useId } from 'react'
import { Plus, X } from 'lucide-react'
import { useCreateProblem } from '@/hooks/useApi'
import { useProblemAuthoringAssist } from '@/hooks/useProblemAuthoringAssist'
import type { GradingMode, PlatformModel } from '@/types'
import { Button } from '@/components/ui/button'
import { TagInput } from '@/components/ui/tag-input'
import { cn } from '@/lib/utils'
import { parseRowsToTestCases, type TestCaseRow } from '@/utils/test-case-rows'
import { ProblemAuthoringAssistPanel } from './problem-authoring-assist-panel'

export type CreateProblemProps = {
  models: PlatformModel[]
  defaultModelId: string
  /** 创建成功（服务端返回题目 id） */
  onCreated: (problemId: string) => void
  /** 有则显示取消按钮（抽屉 / 弹层关闭） */
  onCancel?: () => void
  cancelLabel?: string
  submitLabel?: string
  className?: string
  /** 可滚动表单区（抽屉内需包 padding；独立页可配 max-w 等） */
  contentClassName?: string
  /** 底部按钮栏（抽屉可与 content 分离以固定在抽屉底部） */
  footerClassName?: string
}

export function CreateProblem({
  models,
  defaultModelId,
  onCreated,
  onCancel,
  cancelLabel = '取消',
  submitLabel = '保存题目',
  className,
  contentClassName,
  footerClassName,
}: CreateProblemProps) {
  const gradingName = useId()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [functionSignature, setFunctionSignature] = useState('')
  const [entryPoint, setEntryPoint] = useState('')
  const [gradingMode, setGradingMode] = useState<GradingMode>('expected')
  const [verifySource, setVerifySource] = useState('')
  const [testCaseRows, setTestCaseRows] = useState<TestCaseRow[]>([])
  const [llmNote, setLlmNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const { authorModelId, setAuthorModelId, suggestPending, requestSuggest } =
    useProblemAuthoringAssist(defaultModelId)
  const create = useCreateProblem()

  const handleSuggest = () => {
    requestSuggest({
      title,
      description,
      functionSignature,
      tags,
      testCaseRows,
      setError,
      setLlmNote,
      onSuccess: (data) => {
        if (data.title?.trim()) setTitle(data.title.trim())
        if (data.functionSignature?.trim()) setFunctionSignature(data.functionSignature.trim())
        setEntryPoint(data.entryPoint)
        setGradingMode(data.gradingMode)
        if (data.gradingMode === 'verify') {
          setVerifySource(data.verifySource ?? '')
        } else {
          setVerifySource('')
        }
        setTestCaseRows(
          data.testCases.map((t) => ({
            data: JSON.stringify(t.data),
            ans:
              data.gradingMode === 'expected' && t.ans !== undefined
                ? JSON.stringify(t.ans)
                : '',
          })),
        )
      },
    })
  }

  const handleSave = () => {
    setError(null)
    let parsed: { data: unknown[][]; answers: unknown[] | null }
    try {
      parsed = parseRowsToTestCases(testCaseRows, gradingMode)
    } catch (e) {
      setError(e instanceof Error ? e.message : '解析失败')
      return
    }
    const { data: testCasesData, answers: ansList } = parsed

    if (!description.trim()) {
      setError('题目描述必填')
      return
    }
    if (!title.trim()) {
      setError('请填写标题（可先使用大模型辅助生成）')
      return
    }
    if (testCasesData.length === 0) {
      setError('请至少有一条测试用例，可先使用大模型辅助生成')
      return
    }
    if (gradingMode === 'expected' && (!ansList || ansList.length !== testCasesData.length)) {
      setError('标准答案与用例条数不一致')
      return
    }
    if (!functionSignature.trim() || !entryPoint.trim()) {
      setError('签名与入口名必填')
      return
    }
    if (gradingMode === 'verify' && !verifySource.trim()) {
      setError('verify 模式下须填写验证函数源码')
      return
    }

    const testCases = testCasesData.map((data, i) => {
      if (gradingMode === 'expected' && ansList) {
        return {
          data,
          ans: ansList[i],
        }
      }
      return { data }
    })

    create.mutate(
      {
        title: title.trim(),
        description: description.trim(),
        tags,
        entryPoint: entryPoint.trim(),
        functionSignature: functionSignature.trim(),
        gradingMode,
        verifySource: gradingMode === 'verify' ? verifySource.trim() : null,
        testCases,
      },
      {
        onSuccess: (res) => {
          onCreated(res.problem.id)
        },
        onError: (e) => {
          setError(e instanceof Error ? e.message : '保存失败')
        },
      },
    )
  }

  const addTestCaseRow = () => {
    setTestCaseRows((prev) => [...prev, { data: '', ans: '' }])
  }

  const removeTestCaseRow = (index: number) => {
    setTestCaseRows((prev) => prev.filter((_, i) => i !== index))
  }

  const updateTestCaseRow = (index: number, patch: Partial<TestCaseRow>) => {
    setTestCaseRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col', className)}>
      <div className={cn('min-h-0 flex-1 space-y-3 overflow-y-auto text-sm', contentClassName)}>
        {error && (
          <p className="rounded-md border border-red-500/40 bg-red-500/10 px-2 py-1.5 text-xs text-red-700 dark:text-red-300">
            {error}
          </p>
        )}
        {llmNote && (
          <p className="rounded-md border border-border bg-muted/40 px-2 py-1.5 text-xs text-muted-foreground">
            模型说明：{llmNote}
          </p>
        )}
        <label className="block space-y-1">
          <span className="text-xs font-medium text-muted-foreground">题目描述（题干）</span>
          <textarea
            className="min-h-[11rem] w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm leading-relaxed text-foreground"
            rows={10}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="完整题目要求：输入输出说明、约束、示例等…"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-muted-foreground">标题</span>
          <p className="text-[11px] text-muted-foreground">可先留空，使用「大模型辅助」后自动补全短标题。</p>
          <input
            className="mt-0.5 w-full rounded-md border border-input bg-background px-2 py-1.5 text-foreground"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="例如：两数之和"
          />
        </label>
        <div className="space-y-1">
          <span className="text-xs font-medium text-muted-foreground">标签</span>
          <p className="text-[11px] text-muted-foreground">输入后按 Enter 添加；也可用英文/中文逗号一次输入多个。</p>
          <TagInput value={tags} onChange={setTags} placeholder="数组" aria-label="题目标签" />
        </div>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-muted-foreground">函数签名</span>
          <p className="text-[11px] text-muted-foreground">可留空，由大模型根据题干生成。</p>
          <textarea
            className="mt-0.5 w-full rounded-md border border-input bg-background px-2 py-1.5 font-mono text-xs text-foreground"
            rows={2}
            value={functionSignature}
            onChange={(e) => setFunctionSignature(e.target.value)}
            placeholder="例如：function twoSum(nums: number[], target: number): number[]"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-muted-foreground">入口函数名</span>
          <input
            className="w-full rounded-md border border-input bg-background px-2 py-1.5 font-mono text-xs text-foreground"
            value={entryPoint}
            onChange={(e) => setEntryPoint(e.target.value)}
            placeholder="与签名中的函数名一致"
          />
        </label>

        <div className="space-y-2">
          <div>
            <span className="text-xs font-medium text-muted-foreground">测试用例</span>
            <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
              每条用例两行字符串：「测试输入」为传给函数的参数 JSON 数组；标准答案模式下再填「标准答案」单行 JSON（数字、数组、字符串等均可）。留空行可在保存时跳过；辅助生成前可一条都不填。
            </p>
          </div>
          {testCaseRows.length === 0 ? (
            <p className="rounded-md border border-dashed border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
              暂无手动用例。可直接点「大模型辅助」生成，或点击下方添加。
            </p>
          ) : (
            <ul className="space-y-2">
              {testCaseRows.map((row, i) => (
                <li
                  key={i}
                  className="rounded-md border border-border bg-muted/10 p-3 space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-muted-foreground">用例 {i + 1}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0 text-muted-foreground"
                      onClick={() => removeTestCaseRow(i)}
                      aria-label={`删除用例 ${i + 1}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <label className="block space-y-1">
                    <span className="text-[11px] text-muted-foreground">测试输入（JSON 数组）</span>
                    <textarea
                      className="min-h-[3rem] w-full rounded-md border border-input bg-background px-2 py-1.5 font-mono text-xs text-foreground"
                      value={row.data}
                      onChange={(e) => updateTestCaseRow(i, { data: e.target.value })}
                      placeholder='例如 [[2,7,11,15], 9] 表示两个参数'
                      rows={2}
                    />
                  </label>
                  {gradingMode === 'expected' && (
                    <label className="block space-y-1">
                      <span className="text-[11px] text-muted-foreground">标准答案（单行 JSON）</span>
                      <textarea
                        className="min-h-[2.5rem] w-full rounded-md border border-input bg-background px-2 py-1.5 font-mono text-xs text-foreground"
                        value={row.ans}
                        onChange={(e) => updateTestCaseRow(i, { ans: e.target.value })}
                        placeholder="例如 [0,1]"
                        rows={2}
                      />
                    </label>
                  )}
                </li>
              ))}
            </ul>
          )}
          <Button type="button" variant="outline" size="sm" className="gap-1" onClick={addTestCaseRow}>
            <Plus className="h-3.5 w-3.5" />
            添加用例
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">判题</span>
          <label className="flex items-center gap-1.5 text-xs">
            <input
              type="radio"
              name={gradingName}
              checked={gradingMode === 'expected'}
              onChange={() => setGradingMode('expected')}
            />
            标准答案
          </label>
          <label className="flex items-center gap-1.5 text-xs">
            <input
              type="radio"
              name={gradingName}
              checked={gradingMode === 'verify'}
              onChange={() => setGradingMode('verify')}
            />
            验证函数
          </label>
        </div>
        {gradingMode === 'verify' && (
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">verify 源码</span>
            <textarea
              className="min-h-[8rem] w-full rounded-md border border-input bg-background px-2 py-1.5 font-mono text-xs text-foreground"
              value={verifySource}
              onChange={(e) => setVerifySource(e.target.value)}
              placeholder={'function verify(...args, candidate) {\n  return false;\n}'}
            />
          </label>
        )}
        <ProblemAuthoringAssistPanel
          models={models}
          authorModelId={authorModelId}
          onAuthorModelIdChange={setAuthorModelId}
          onSuggest={handleSuggest}
          pending={suggestPending}
        />
      </div>
      <div
        className={cn(
          'flex shrink-0 justify-end gap-2 border-t border-border pt-3',
          footerClassName,
        )}
      >
        {onCancel && (
          <Button type="button" variant="outline" size="sm" onClick={onCancel}>
            {cancelLabel}
          </Button>
        )}
        <Button type="button" size="sm" disabled={create.isPending} onClick={handleSave}>
          {create.isPending ? '保存中…' : submitLabel}
        </Button>
      </div>
    </div>
  )
}
