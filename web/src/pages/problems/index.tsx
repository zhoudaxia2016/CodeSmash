import { useEffect, useMemo, useState, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { useQueryClient } from '@tanstack/react-query'
import {
  useDeleteProblem,
  useModels,
  useProblem,
  useProblems,
} from '@/hooks/useApi'
import { usePersistProblemEditorUpdate } from '@/hooks/usePersistProblemEditorUpdate'
import type { GradingMode, Problem } from '@/types'
import { defaultAuthoringModelId } from '@/lib/authoring-model'
import { ProblemEditor, type ProblemEditorProps } from '@/components/problem-editor'
import { NewProblem } from './new-problem'
import { ProblemList } from './problem-list'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const PROBLEMS_HEADER_SLOT_ID = 'problems-header-slot'

type GradingFilter = 'all' | GradingMode
type SortKey = 'updated' | 'title'

function matchesSearch(p: Problem, q: string): boolean {
  const s = q.trim().toLowerCase()
  if (!s) return true
  if (p.title.toLowerCase().includes(s)) return true
  if (p.description.toLowerCase().includes(s)) return true
  return false
}

export function ProblemsPage() {
  const queryClient = useQueryClient()
  const { data: models = [], isLoading: modelsLoading } = useModels()
  const { data: problems = [], isLoading: problemsLoading, isError: problemsError } = useProblems()
  const [search, setSearch] = useState('')
  const [tagFilter, setTagFilter] = useState<string>('all')
  const [gradingFilter, setGradingFilter] = useState<GradingFilter>('all')
  const [sortKey, setSortKey] = useState<SortKey>('updated')
  const [newOpen, setNewOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [headerSlotEl, setHeaderSlotEl] = useState<HTMLElement | null>(null)

  const persistProblemEditorUpdate = usePersistProblemEditorUpdate()
  const deleteProblem = useDeleteProblem()

  useLayoutEffect(() => {
    setHeaderSlotEl(document.getElementById(PROBLEMS_HEADER_SLOT_ID))
  }, [])

  const editQuery = useProblem(editId ?? '', {
    enabled: !!editId && editOpen,
  })

  const tagOptions = useMemo(() => {
    const s = new Set<string>()
    for (const p of problems) {
      for (const t of p.tags ?? []) s.add(t)
    }
    return Array.from(s).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
  }, [problems])

  useEffect(() => {
    if (tagFilter !== 'all' && !tagOptions.includes(tagFilter)) {
      setTagFilter('all')
    }
  }, [tagFilter, tagOptions])

  const filtered = useMemo(() => {
    let list = problems.filter((p) => matchesSearch(p, search))
    if (tagFilter !== 'all') {
      list = list.filter((p) => (p.tags ?? []).includes(tagFilter))
    }
    if (gradingFilter !== 'all') {
      list = list.filter((p) => (p.gradingMode ?? 'expected') === gradingFilter)
    }
    const next = [...list]
    next.sort((a, b) => {
      if (sortKey === 'title') {
        return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })
      }
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    })
    return next
  }, [problems, search, tagFilter, gradingFilter, sortKey])

  const editSummary = editId ? problems.find((p) => p.id === editId) : undefined
  const detailLoading =
    editOpen && !!editId && editQuery.isLoading && !editQuery.data
  const detailFailed = editOpen && !!editId && editQuery.isError && !editQuery.data

  const openEdit = (id: string) => {
    setEditId(id)
    setEditOpen(true)
  }

  const handleDelete = (p: Problem) => {
    if (!window.confirm(`确定删除题目「${p.title}」？此操作不可撤销。`)) return
    setDeleteError(null)
    deleteProblem.mutate(p.id, {
      onSuccess: () => {
        if (editId === p.id) {
          setEditOpen(false)
          setEditId(null)
        }
      },
      onError: (e) => {
        setDeleteError(e instanceof Error ? e.message : '删除失败')
      },
    })
  }

  const loading = modelsLoading || problemsLoading

  const headerActions = (
    <Button
      type="button"
      size="sm"
      className="h-9 shrink-0"
      disabled={models.length === 0}
      title={models.length === 0 ? '需至少一个可用模型以使用命题辅助' : undefined}
      onClick={() => setNewOpen(true)}
    >
      新建题目
    </Button>
  )

  return (
    <div className="space-y-5">
      {headerSlotEl ? createPortal(headerActions, headerSlotEl) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <label className="flex min-w-0 flex-1 flex-col gap-1.5 sm:min-w-[12rem]">
          <span className="text-xs font-medium text-muted-foreground">搜索</span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="标题、描述…"
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            aria-label="筛选题目"
          />
        </label>
        <div className="flex flex-col gap-1.5 sm:w-44">
          <span className="text-xs font-medium text-muted-foreground">标签</span>
          <Select value={tagFilter} onValueChange={setTagFilter}>
            <SelectTrigger aria-label="按标签筛选">
              <SelectValue placeholder="全部标签" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部标签</SelectItem>
              {tagOptions.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5 sm:w-44">
          <span className="text-xs font-medium text-muted-foreground">评分模式</span>
          <Select value={gradingFilter} onValueChange={(v) => setGradingFilter(v as GradingFilter)}>
            <SelectTrigger aria-label="评分模式">
              <SelectValue placeholder="全部" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部</SelectItem>
              <SelectItem value="expected">expected</SelectItem>
              <SelectItem value="verify">verify</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5 sm:w-44">
          <span className="text-xs font-medium text-muted-foreground">排序</span>
          <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
            <SelectTrigger aria-label="排序">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="updated">最近更新</SelectItem>
              <SelectItem value="title">标题 A–Z</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {deleteError && (
        <p className="text-sm text-destructive" role="alert">
          {deleteError}
        </p>
      )}

      {loading && <p className="text-sm text-muted-foreground">加载中…</p>}
      {problemsError && !loading && (
        <p className="text-sm text-destructive" role="alert">
          题目列表加载失败，请稍后重试。
        </p>
      )}
      {!loading && !problemsError && problems.length === 0 && (
        <div className="rounded-md border border-dashed border-border bg-muted/20 px-6 py-12 text-center">
          <p className="text-sm text-muted-foreground">还没有题目。</p>
          <Button
            type="button"
            className="mt-4"
            size="sm"
            disabled={models.length === 0}
            onClick={() => setNewOpen(true)}
          >
            新建题目
          </Button>
        </div>
      )}
      {!loading && !problemsError && problems.length > 0 && filtered.length === 0 && (
        <div className="rounded-md border border-dashed border-border bg-muted/20 px-6 py-12 text-center">
          <p className="text-sm text-muted-foreground">没有符合当前筛选条件的题目。</p>
          <Button
            type="button"
            variant="outline"
            className="mt-4"
            size="sm"
            onClick={() => {
              setSearch('')
              setTagFilter('all')
              setGradingFilter('all')
            }}
          >
            清除筛选
          </Button>
        </div>
      )}
      {!loading && !problemsError && filtered.length > 0 && (
        <ProblemList
          items={filtered}
          onRowActivate={openEdit}
          onDelete={handleDelete}
          deletePending={deleteProblem.isPending}
        />
      )}

      <NewProblem
        open={newOpen}
        onOpenChange={setNewOpen}
        models={models}
        defaultModelId={defaultAuthoringModelId(models)}
        tagSuggestions={tagOptions}
        onCreated={(id) => {
          setNewOpen(false)
          void queryClient.invalidateQueries({ queryKey: ['problems'] })
          void queryClient.invalidateQueries({ queryKey: ['problems', id] })
        }}
      />

      {editOpen && editSummary && (
        <ProblemEditor
          open={editOpen}
          onOpenChange={(open) => {
            setEditOpen(open)
            if (!open) setEditId(null)
          }}
          title="编辑题目"
          titleId="problems-edit-title"
          mode="edit"
          problemId={editId!}
          detail={editQuery.data ?? null}
          loading={detailLoading}
          loadFailed={detailFailed}
          problemSummary={editSummary}
          models={models}
          defaultModelId={defaultAuthoringModelId(models)}
          tagSuggestions={tagOptions}
          onConfirm={async (
            args: Parameters<NonNullable<ProblemEditorProps['onConfirm']>>[0],
          ) => {
            await persistProblemEditorUpdate(args)
            if (args.kind === 'update') {
              setEditOpen(false)
              setEditId(null)
            }
          }}
          submitLabel="保存全部"
        />
      )}
    </div>
  )
}
