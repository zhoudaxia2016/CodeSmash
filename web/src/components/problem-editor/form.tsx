import { useState, useEffect, useRef } from 'react'
import { Plus, Trash2, X } from 'lucide-react'
import { useProblemAuthoringAssist } from '@/hooks/useProblemAuthoringAssist'
import type {
  GradingMode,
  PlatformModel,
  Problem,
  ProblemAuthoringResponse,
  TestCase,
} from '@/types'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { parseRowsToTestCases, type TestCaseRow } from '@/utils/test-case-rows'
import { ProblemAuthoringAssistPanel } from './authoring-assist-panel'
import { ProblemFormFields, ProblemGradingBlock } from './core-fields'

type ProblemEditorRow = {
  key: string
  serverId?: string
  data: string
  ans: string
  deleted?: boolean
}

type ProblemEditorConfirmCreate = {
  kind: 'create'
  problem: {
    title: string
    description: string
    tags: string[]
    entryPoint: string
    functionSignature: string
    gradingMode: GradingMode
    verifySource: string | null
    testCases: Array<{ data: unknown[]; ans?: unknown }>
  }
}

type ProblemEditorConfirmUpdate = {
  kind: 'update'
  problemId: string
  problem: {
    title: string
    description: string
    tags: string[]
    entryPoint: string
    functionSignature: string
    gradingMode: GradingMode
    verifySource: string | null
  }
  testCaseDeletes: string[]
  testCaseUpdates: Array<{ testCaseId: string; data: unknown[]; ans?: unknown }>
  testCaseCreates: Array<{ data: unknown[]; ans?: unknown }>
}

type ProblemEditorConfirmArgs = ProblemEditorConfirmCreate | ProblemEditorConfirmUpdate

type Props = {
  mode: 'create' | 'edit'
  models: PlatformModel[]
  defaultModelId: string
  problemId?: string
  detail?: { problem: Problem; testCases: TestCase[] } | null
  loading?: boolean
  loadFailed?: boolean
  problemSummary?: Problem
  /** 全库出现过的标签，用于标签输入快捷选择 */
  tagSuggestions?: string[]
  onConfirm: (args: ProblemEditorConfirmArgs) => Promise<void>
  onCancel?: () => void
  cancelLabel?: string
  submitLabel?: string
  /** 只读浏览：禁用表单与命题辅助，底部仅保留关闭。 */
  viewOnly?: boolean
}

function normalizeDataKey(dataStr: string): string | null {
  const t = dataStr.trim()
  if (!t) return null
  try {
    return JSON.stringify(JSON.parse(t))
  } catch {
    return null
  }
}

function parseRowPayload(
  r: ProblemEditorRow,
  gradingMode: GradingMode,
): { data: unknown[]; ans?: unknown } | { error: string } {
  const ds = r.data.trim()
  if (!ds) return { error: '测试输入不能为空' }
  let data: unknown
  try {
    data = JSON.parse(ds) as unknown
  } catch {
    return { error: '测试输入 JSON 无效' }
  }
  if (!Array.isArray(data)) return { error: '测试输入须为 JSON 数组' }
  if (gradingMode === 'expected') {
    const as = r.ans.trim()
    if (!as) return { error: '标准答案模式下每条用例须有标准答案 JSON' }
    try {
      return { data, ans: JSON.parse(as) as unknown }
    } catch {
      return { error: '标准答案 JSON 无效' }
    }
  }
  return { data }
}

function rowsToTestCaseRows(rows: ProblemEditorRow[]): TestCaseRow[] {
  return rows.filter((r) => !r.deleted).map((r) => ({ data: r.data, ans: r.ans }))
}

export function ProblemEditorForm({
  mode,
  models,
  defaultModelId,
  problemId,
  detail,
  loading = false,
  loadFailed = false,
  problemSummary,
  tagSuggestions,
  onConfirm,
  onCancel,
  cancelLabel = '取消',
  submitLabel,
  viewOnly = false,
}: Props) {
  const lastResetKey = useRef('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [functionSignature, setFunctionSignature] = useState('')
  const [entryPoint, setEntryPoint] = useState('')
  const [gradingMode, setGradingMode] = useState<GradingMode>('expected')
  const [assistGradingFromForm, setAssistGradingFromForm] = useState(false)
  const [verifySource, setVerifySource] = useState('')
  const [rows, setRows] = useState<ProblemEditorRow[]>([])
  const [initialTc, setInitialTc] = useState<Map<string, { data: string; ans: string }>>(new Map())
  const [llmNote, setLlmNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const { authorModelId, setAuthorModelId, suggestPending, requestSuggest } =
    useProblemAuthoringAssist(defaultModelId)

  const resetKey =
    mode === 'edit' && detail && problemId
      ? `${problemId}:${detail.problem.updatedAt}`
      : mode === 'create'
        ? 'create'
        : ''

  useEffect(() => {
    if (mode === 'create') {
      if (lastResetKey.current === 'create') return
      lastResetKey.current = 'create'
      setTitle('')
      setDescription('')
      setTags([])
      setFunctionSignature('')
      setEntryPoint('')
      setGradingMode('expected')
      setAssistGradingFromForm(false)
      setVerifySource('')
      setRows([])
      setInitialTc(new Map())
      setError(null)
      setLlmNote(null)
      return
    }
    if (!detail || !problemId) return
    if (lastResetKey.current === resetKey) return
    lastResetKey.current = resetKey
    const p = detail.problem
    setTitle(p.title)
    setDescription(p.description)
    setTags(p.tags ?? [])
    setFunctionSignature(p.functionSignature)
    setEntryPoint(p.entryPoint)
    setGradingMode(p.gradingMode ?? 'expected')
    setAssistGradingFromForm(false)
    setVerifySource(p.verifySource?.trim() ?? '')
    setError(null)
    setLlmNote(null)
    const next: ProblemEditorRow[] = detail.testCases.map((tc) => ({
      key: tc.id,
      serverId: tc.id,
      data: tc.input,
      ans: tc.expectedOutput ?? '',
      deleted: false,
    }))
    setRows(next)
    const snap = new Map<string, { data: string; ans: string }>()
    for (const tc of detail.testCases) {
      snap.set(tc.id, { data: tc.input, ans: tc.expectedOutput ?? '' })
    }
    setInitialTc(snap)
  }, [mode, detail, problemId, resetKey])

  const formVariant = mode === 'create' ? 'create' : 'edit'
  const defaultSubmit = mode === 'create' ? '保存题目' : '保存全部'
  const assistHintEdit =
    '「大模型辅助」会参考当前用例，追加与现有 data（规范化 JSON）不重复的新行；保存前请核对后再提交。'
  const assistHintCreate =
    '每条用例：测试输入为 JSON 数组；标准答案模式再填标准答案。留空行保存时跳过；也可先不填再用大模型辅助。'

  const applyAuthoringGradingFields = (data: ProblemAuthoringResponse) => {
    setEntryPoint(data.entryPoint)
    setGradingMode(data.gradingMode)
    if (data.gradingMode === 'verify') {
      setVerifySource(typeof data.verifySource === 'string' ? data.verifySource : '')
    } else {
      setVerifySource('')
    }
  }

  const handleSuggestCreate = () => {
    requestSuggest({
      title,
      description,
      functionSignature,
      tags,
      testCaseRows: rowsToTestCaseRows(rows),
      gradingMode,
      assistGradingFromForm,
      setError,
      setLlmNote,
      onSuccess: (data) => {
        if (data.title?.trim()) setTitle(data.title.trim())
        if (data.functionSignature?.trim()) setFunctionSignature(data.functionSignature.trim())
        applyAuthoringGradingFields(data)
        setRows(
          data.testCases.map((t) => ({
            key: `new-${crypto.randomUUID()}`,
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

  const handleSuggestEdit = () => {
    requestSuggest({
      title,
      description,
      functionSignature,
      tags,
      testCaseRows: rowsToTestCaseRows(rows),
      gradingMode,
      assistGradingFromForm,
      setError,
      setLlmNote,
      onSuccess: (data) => {
        applyAuthoringGradingFields(data)
        if (data.title?.trim()) setTitle(data.title.trim())
        if (data.functionSignature?.trim()) setFunctionSignature(data.functionSignature.trim())

        const existing = new Set<string>()
        for (const r of rows) {
          if (r.deleted) continue
          const k = normalizeDataKey(r.data)
          if (k) existing.add(k)
        }
        const toAdd: ProblemEditorRow[] = []
        for (const t of data.testCases) {
          const k = JSON.stringify(t.data)
          if (existing.has(k)) continue
          existing.add(k)
          toAdd.push({
            key: `new-${crypto.randomUUID()}`,
            data: JSON.stringify(t.data),
            ans:
              data.gradingMode === 'expected' && t.ans !== undefined
                ? JSON.stringify(t.ans)
                : '',
          })
        }
        if (toAdd.length === 0) {
          setLlmNote(data.reasoning?.trim() || '模型未返回新的用例（可能与现有重复）。')
        } else {
          setRows((prev) => [...prev, ...toAdd])
          setLlmNote(data.reasoning?.trim() || `已追加 ${toAdd.length} 条用例，请核对后再保存。`)
        }
      },
    })
  }

  const addRow = () => {
    setRows((prev) => [
      ...prev,
      { key: `new-${crypto.randomUUID()}`, data: '', ans: '', deleted: false },
    ])
  }

  const removeOrDeleteRow = (key: string) => {
    setRows((prev) => {
      const r = prev.find((x) => x.key === key)
      if (mode === 'create' || (r && !r.serverId)) {
        return prev.filter((x) => x.key !== key)
      }
      return prev.map((x) => (x.key === key ? { ...x, deleted: true } : x))
    })
  }

  const restoreRow = (key: string) => {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, deleted: false } : r)))
  }

  const updateRow = (key: string, patch: Partial<Pick<ProblemEditorRow, 'data' | 'ans'>>) => {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  }

  const handleSubmit = async () => {
    setError(null)
    if (!title.trim() || !description.trim()) {
      setError(mode === 'create' ? '题目描述与标题均必填' : '标题与描述必填')
      return
    }
    if (!functionSignature.trim() || !entryPoint.trim()) {
      setError('函数签名与入口名必填')
      return
    }
    if (gradingMode === 'verify' && !verifySource.trim()) {
      setError('verify 模式下须填写验证函数源码')
      return
    }

    const visible = rows.filter((r) => !r.deleted)

    if (mode === 'create') {
      let parsed: { data: unknown[][]; answers: unknown[] | null }
      try {
        parsed = parseRowsToTestCases(rowsToTestCaseRows(rows), gradingMode)
      } catch (e) {
        setError(e instanceof Error ? e.message : '解析失败')
        return
      }
      const { data: testCasesData, answers: ansList } = parsed
      if (testCasesData.length === 0) {
        setError('请至少有一条测试用例，可先使用大模型辅助生成')
        return
      }
      if (gradingMode === 'expected' && (!ansList || ansList.length !== testCasesData.length)) {
        setError('标准答案与用例条数不一致')
        return
      }
      const testCases = testCasesData.map((data, i) => {
        if (gradingMode === 'expected' && ansList) {
          return { data, ans: ansList[i] }
        }
        return { data }
      })
      setPending(true)
      try {
        await onConfirm({
          kind: 'create',
          problem: {
            title: title.trim(),
            description: description.trim(),
            tags,
            entryPoint: entryPoint.trim(),
            functionSignature: functionSignature.trim(),
            gradingMode,
            verifySource: gradingMode === 'verify' ? verifySource.trim() : null,
            testCases,
          },
        })
      } catch (e) {
        setError(e instanceof Error ? e.message : '保存失败')
      } finally {
        setPending(false)
      }
      return
    }

    if (!problemId) {
      setError('缺少题目 id')
      return
    }
    for (let i = 0; i < visible.length; i++) {
      const p = parseRowPayload(visible[i], gradingMode)
      if ('error' in p) {
        setError(`用例 ${i + 1}：${p.error}`)
        return
      }
    }

    const testCaseDeletes: string[] = []
    for (const r of rows) {
      if (r.deleted && r.serverId) testCaseDeletes.push(r.serverId)
    }
    const testCaseUpdates: Array<{ testCaseId: string; data: unknown[]; ans?: unknown }> = []
    for (const r of rows) {
      if (r.deleted || !r.serverId) continue
      const orig = initialTc.get(r.serverId)
      if (!orig) continue
      if (orig.data === r.data && orig.ans === r.ans) continue
      const p = parseRowPayload(r, gradingMode)
      if ('error' in p) continue
      testCaseUpdates.push({ testCaseId: r.serverId, data: p.data, ans: p.ans })
    }
    const testCaseCreates: Array<{ data: unknown[]; ans?: unknown }> = []
    for (const r of rows) {
      if (r.deleted || r.serverId) continue
      const p = parseRowPayload(r, gradingMode)
      if ('error' in p) continue
      testCaseCreates.push({ data: p.data, ans: p.ans })
    }

    setPending(true)
    try {
      await onConfirm({
        kind: 'update',
        problemId,
        problem: {
          title: title.trim(),
          description: description.trim(),
          tags,
          entryPoint: entryPoint.trim(),
          functionSignature: functionSignature.trim(),
          gradingMode,
          verifySource: gradingMode === 'verify' ? verifySource.trim() : null,
        },
        testCaseDeletes,
        testCaseUpdates,
        testCaseCreates,
      })
      lastResetKey.current = ''
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败')
    } finally {
      setPending(false)
    }
  }

  const showForm = mode === 'create' || (!loading && !loadFailed && detail)
  const showFooter = mode === 'create' || (!loading && !loadFailed && detail)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className={cn('min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4 text-sm')}>
        {mode === 'edit' && loading && (
          <p className="text-sm text-muted-foreground">正在加载题目详情…</p>
        )}
        {mode === 'edit' && loadFailed && (
          <div className="text-sm text-amber-700 dark:text-amber-300">
            <p>无法加载题目详情（接口不可用）。可稍后重试。</p>
            {problemSummary && (
              <div className="mt-3 text-muted-foreground">
                <p className="font-medium text-foreground">{problemSummary.title}</p>
                <p className="mt-1 whitespace-pre-wrap">{problemSummary.description}</p>
              </div>
            )}
          </div>
        )}

        {showForm && (
          <>
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

            <fieldset
              disabled={viewOnly}
              className={cn('min-w-0 border-0 p-0', viewOnly && 'opacity-95')}
            >
            <ProblemFormFields
              variant={formVariant}
              title={title}
              onTitleChange={setTitle}
              description={description}
              onDescriptionChange={setDescription}
              tags={tags}
              onTagsChange={setTags}
              tagSuggestions={tagSuggestions}
              functionSignature={functionSignature}
              onFunctionSignatureChange={setFunctionSignature}
              entryPoint={entryPoint}
              onEntryPointChange={setEntryPoint}
            />

            <div className="space-y-2">
              <div>
                <span className="text-xs font-medium text-muted-foreground">测试用例</span>
                <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                  {mode === 'edit' ? assistHintEdit : assistHintCreate}
                </p>
              </div>
              {rows.length === 0 ? (
                <p className="rounded-md border border-dashed border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                  {mode === 'create'
                    ? '暂无手动用例。可直接点「大模型辅助」生成，或点击下方添加。'
                    : '暂无测试用例，可添加或使用「大模型辅助」生成。'}
                </p>
              ) : (
                <ul className="space-y-2">
                  {(() => {
                    let n = 0
                    return rows.map((r) => {
                      if (r.deleted) {
                        return (
                          <li
                            key={r.key}
                            className="flex items-center justify-between gap-2 rounded-md border border-dashed border-amber-500/40 bg-amber-500/5 px-2 py-1.5 text-xs text-muted-foreground"
                          >
                            <span>已保存用例（已标记删除，保存后从服务器移除）</span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => restoreRow(r.key)}
                            >
                              恢复
                            </Button>
                          </li>
                        )
                      }
                      n += 1
                      return (
                        <li
                          key={r.key}
                          className="rounded-md border border-border bg-muted/10 p-3 space-y-2"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-medium text-muted-foreground">
                              用例 {n}
                            </span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 shrink-0 text-muted-foreground"
                              onClick={() => removeOrDeleteRow(r.key)}
                              aria-label="删除用例"
                            >
                              {mode === 'edit' && r.serverId ? (
                                <Trash2 className="h-3.5 w-3.5" />
                              ) : (
                                <X className="h-3.5 w-3.5" />
                              )}
                            </Button>
                          </div>
                          <label className="block space-y-1">
                            <span className="text-[11px] text-muted-foreground">
                              测试输入（JSON 数组）
                            </span>
                            <textarea
                              className="min-h-[3rem] w-full rounded-md border border-input bg-background px-2 py-1.5 font-mono text-xs text-foreground"
                              value={r.data}
                              onChange={(e) => updateRow(r.key, { data: e.target.value })}
                              placeholder={
                                mode === 'create'
                                  ? '例如 [[2,7,11,15], 9] 表示两个参数'
                                  : undefined
                              }
                              rows={2}
                            />
                          </label>
                          {gradingMode === 'expected' && (
                            <label className="block space-y-1">
                              <span className="text-[11px] text-muted-foreground">
                                标准答案（JSON 数组：每项为一条可接受返回值）
                              </span>
                              <textarea
                                className="min-h-[2.5rem] w-full rounded-md border border-input bg-background px-2 py-1.5 font-mono text-xs text-foreground"
                                value={r.ans}
                                onChange={(e) => updateRow(r.key, { ans: e.target.value })}
                                placeholder={
                                  mode === 'create'
                                    ? '例如 [[0,1]] 单解；多解 [1,2] 或 [[0,3],[1,2]]'
                                    : undefined
                                }
                                rows={2}
                              />
                            </label>
                          )}
                        </li>
                      )
                    })
                  })()}
                </ul>
              )}
              {!viewOnly && (
                <Button type="button" variant="outline" size="sm" className="gap-1" onClick={addRow}>
                  <Plus className="h-3.5 w-3.5" />
                  添加用例
                </Button>
              )}
            </div>

            <div className="space-y-3">
              <ProblemGradingBlock
                gradingMode={gradingMode}
                onGradingModeChange={setGradingMode}
                verifySource={verifySource}
                onVerifySourceChange={setVerifySource}
                verifyMinHeightClass={mode === 'edit' ? 'min-h-[6rem]' : undefined}
              />
            </div>
            </fieldset>
            {!viewOnly && (
            <ProblemAuthoringAssistPanel
              models={models}
              authorModelId={authorModelId}
              onAuthorModelIdChange={setAuthorModelId}
              assistGradingFromForm={assistGradingFromForm}
              onAssistGradingFromFormChange={setAssistGradingFromForm}
              onSuggest={mode === 'create' ? handleSuggestCreate : handleSuggestEdit}
              pending={suggestPending}
            />
            )}
          </>
        )}
      </div>

      {showFooter && (
        <footer className="flex shrink-0 justify-end gap-2 border-t border-border bg-card px-5 py-3">
          {onCancel && (
            <Button type="button" variant="outline" size="sm" onClick={onCancel}>
              {cancelLabel}
            </Button>
          )}
          {!viewOnly && (
            <Button type="button" size="sm" disabled={pending} onClick={() => void handleSubmit()}>
              {pending ? '保存中…' : submitLabel ?? defaultSubmit}
            </Button>
          )}
        </footer>
      )}
    </div>
  )
}
