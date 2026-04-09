import { useState, useEffect, useRef } from 'react'
import { ExternalLink, Plus, Trash2, X } from 'lucide-react'
import { useProblemAuthoringAssist } from '@/hooks/useProblemAuthoringAssist'
import type {
  GradingMode,
  PlatformModel,
  Problem,
  ProblemAuthoringResponse,
  TestCase,
} from '@/types'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { cn } from '@/lib/utils'
import {
  buildExternalCodingPrompt,
  DEEPSEEK_CHAT_URL,
} from '@/utils/external-coding-prompt'
import { parseRowsToTestCases, type TestCaseRow } from '@/utils/test-case-rows'
import { ProblemAuthoringAssistPanel } from './authoring-assist-panel'
import { ProblemFormFields, ProblemGradingBlock } from './core-fields'

type ProblemEditorRow = {
  key: string
  serverId?: string
  data: string
  ans: string
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
  dialogTitle: string
  dialogTitleId: string
  onClose: () => void
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
  return rows.map((r) => ({ data: r.data, ans: r.ans }))
}

export function ProblemEditorForm({
  dialogTitle,
  dialogTitleId,
  onClose,
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
  const [forcedDeleteIds, setForcedDeleteIds] = useState<string[]>([])
  const [llmNote, setLlmNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [activeTab, setActiveTab] = useState<'problem' | 'testing'>('problem')
  const [clearDialogOpen, setClearDialogOpen] = useState(false)

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
      setForcedDeleteIds([])
      setError(null)
      setLlmNote(null)
      setActiveTab('problem')
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
    setActiveTab('problem')
    const next: ProblemEditorRow[] = detail.testCases.map((tc) => ({
      key: tc.id,
      serverId: tc.id,
      data: tc.input,
      ans: tc.expectedOutput ?? '',
    }))
    setRows(next)
    const snap = new Map<string, { data: string; ans: string }>()
    for (const tc of detail.testCases) {
      snap.set(tc.id, { data: tc.input, ans: tc.expectedOutput ?? '' })
    }
    setInitialTc(snap)
    setForcedDeleteIds([])
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
      { key: `new-${crypto.randomUUID()}`, data: '', ans: '' },
    ])
  }

  const applyClearRows = () => {
    setRows((prev) => {
      if (mode === 'create') return []
      // 编辑态：直接清空 UI；保存时通过 forcedDeleteIds 一次性删除服务端用例。
      const ids = prev
        .filter((r) => !!r.serverId)
        .map((r) => r.serverId as string)
      if (ids.length > 0) {
        setForcedDeleteIds((old) => Array.from(new Set([...old, ...ids])))
      }
      return []
    })
  }

  const clearRows = () => {
    if (rows.length === 0) return
    setClearDialogOpen(true)
  }

  const removeOrDeleteRow = (key: string) => {
    setRows((prev) => {
      const r = prev.find((x) => x.key === key)
      if (r?.serverId) {
        setForcedDeleteIds((old) => (old.includes(r.serverId as string) ? old : [...old, r.serverId as string]))
      }
      return prev.filter((x) => x.key !== key)
    })
  }

  const updateRow = (key: string, patch: Partial<Pick<ProblemEditorRow, 'data' | 'ans'>>) => {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  }

  const handleSubmit = async () => {
    if (pending) return
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
    for (let i = 0; i < rows.length; i++) {
      const p = parseRowPayload(rows[i], gradingMode)
      if ('error' in p) {
        setError(`用例 ${i + 1}：${p.error}`)
        return
      }
    }

    const testCaseDeletes: string[] = [...forcedDeleteIds]
    const uniqueDeletes = Array.from(new Set(testCaseDeletes))
    const testCaseUpdates: Array<{ testCaseId: string; data: unknown[]; ans?: unknown }> = []
    for (const r of rows) {
      if (!r.serverId) continue
      const orig = initialTc.get(r.serverId)
      if (!orig) continue
      if (orig.data === r.data && orig.ans === r.ans) continue
      const p = parseRowPayload(r, gradingMode)
      if ('error' in p) continue
      testCaseUpdates.push({ testCaseId: r.serverId, data: p.data, ans: p.ans })
    }
    const testCaseCreates: Array<{ data: unknown[]; ans?: unknown }> = []
    for (const r of rows) {
      if (r.serverId) continue
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
        testCaseDeletes: uniqueDeletes,
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

  const isProblemDetailLoaded = mode === 'edit' && !!detail

  const copyPromptOpenDeepSeek = async () => {
    setError(null)
    const text = buildExternalCodingPrompt({
      title,
      description,
      tags,
      entryPoint,
      functionSignature,
      gradingMode,
      verifySource: gradingMode === 'verify' ? verifySource : '',
      rows,
    })
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      setError('无法复制到剪贴板，请检查浏览器权限')
      return
    }
    window.open(DEEPSEEK_CHAT_URL, '_blank', 'noopener,noreferrer')
  }

  const showForm = mode === 'create' || (!loading && !loadFailed && detail)
  const showFooter = mode === 'create' || (!loading && !loadFailed && detail)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-card px-5 py-3">
        <div className="min-w-0 flex-1">
          <h2 id={dialogTitleId} className="sr-only">
            {dialogTitle}
          </h2>
          <div className="flex items-center gap-1 rounded-md bg-muted/20 p-1">
            <Button
              type="button"
              size="sm"
              variant={activeTab === 'problem' ? 'secondary' : 'ghost'}
              className="h-8 px-3 text-xs"
              onClick={() => setActiveTab('problem')}
            >
              题目信息
            </Button>
            <Button
              type="button"
              size="sm"
              variant={activeTab === 'testing' ? 'secondary' : 'ghost'}
              className="h-8 px-3 text-xs"
              onClick={() => setActiveTab('testing')}
            >
              测试与判题
            </Button>
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={onClose}
          aria-label="关闭"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className={cn('min-h-0 flex-1 space-y-3 overflow-hidden px-5 py-4 text-sm')}>
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
              className={cn('flex h-full min-h-0 min-w-0 flex-col border-0 p-0', viewOnly && 'opacity-95')}
            >
              <div className="min-h-0 flex-1">
                {activeTab === 'problem' && (
                  <div className="h-full overflow-y-auto px-1">
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
                  </div>
                )}

                {activeTab === 'testing' && (
                  <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden px-1">
                  <div className="flex min-h-0 flex-1 flex-col space-y-2">
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
                      <div className="min-h-0 flex-1 overflow-auto rounded-md border border-border">
                        <table className="min-w-full border-collapse text-xs">
                          <thead className="bg-muted/40">
                            <tr className="border-b border-border text-muted-foreground">
                              <th className="w-14 px-2 py-2 text-left font-medium">#</th>
                              <th className="min-w-[22rem] px-2 py-2 text-left font-medium">
                                测试输入（JSON 数组）
                              </th>
                              {gradingMode === 'expected' && (
                                <th className="min-w-[18rem] px-2 py-2 text-left font-medium">
                                  标准答案（JSON）
                                </th>
                              )}
                              <th className="w-28 px-2 py-2 text-right font-medium">操作</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(() => {
                              let n = 0
                              return rows.map((r) => {
                                n += 1
                                return (
                                  <tr key={r.key} className="border-b border-border/60 align-top">
                                      <td className="px-2 py-2 align-middle text-muted-foreground">{n}</td>
                                      <td className="px-2 py-2">
                                        <textarea
                                          className="h-8 w-full resize-none overflow-x-auto whitespace-pre rounded-md border border-input bg-background px-2 py-1 font-mono text-xs text-foreground"
                                          value={r.data}
                                          onChange={(e) => updateRow(r.key, { data: e.target.value })}
                                          placeholder={
                                            mode === 'create'
                                              ? '例如 [[2,7,11,15], 9] 表示两个参数'
                                              : undefined
                                          }
                                          rows={1}
                                        />
                                      </td>
                                      {gradingMode === 'expected' && (
                                        <td className="px-2 py-2">
                                          <textarea
                                            className="h-8 w-full resize-none overflow-x-auto whitespace-pre rounded-md border border-input bg-background px-2 py-1 font-mono text-xs text-foreground"
                                            value={r.ans}
                                            onChange={(e) => updateRow(r.key, { ans: e.target.value })}
                                            placeholder={
                                              mode === 'create'
                                                ? '例如 [[0,1]] 或 [[0,3],[1,2]]'
                                                : undefined
                                            }
                                            rows={1}
                                          />
                                        </td>
                                      )}
                                      <td className="px-2 py-2">
                                        <div className="flex items-center justify-end gap-1">
                                          <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            className="h-7 w-7 shrink-0 text-muted-foreground"
                                            onClick={() => removeOrDeleteRow(r.key)}
                                            aria-label="删除用例"
                                          >
                                            <Trash2 className="h-3.5 w-3.5" />
                                          </Button>
                                        </div>
                                      </td>
                                    </tr>
                                )
                              })
                            })()}
                          </tbody>
                        </table>
                      </div>
                    )}
                    {!viewOnly && (
                      <div className="flex flex-wrap items-center gap-2">
                        <Button type="button" variant="outline" size="sm" className="gap-1" onClick={addRow}>
                          <Plus className="h-3.5 w-3.5" />
                          添加用例
                        </Button>
                        <Button type="button" variant="outline" size="sm" onClick={clearRows}>
                          清空用例
                        </Button>
                      </div>
                    )}
                    <AlertDialog open={clearDialogOpen} onOpenChange={setClearDialogOpen}>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>清空测试用例</AlertDialogTitle>
                          <AlertDialogDescription>
                            确定清空当前测试用例吗？此操作在保存后生效。
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>取消</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => {
                              applyClearRows()
                              setClearDialogOpen(false)
                            }}
                          >
                            确认清空
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
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
                  </div>
                )}
              </div>
            </fieldset>
          </>
        )}
      </div>

      {showFooter && (
        <footer className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-border bg-card px-5 py-3">
          <div className="flex flex-wrap items-center gap-2">
            {isProblemDetailLoaded && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1"
                onClick={() => void copyPromptOpenDeepSeek()}
              >
                <ExternalLink className="h-3.5 w-3.5" />
                复制题面并在 DeepSeek 提问
              </Button>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
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
          </div>
        </footer>
      )}
    </div>
  )
}
