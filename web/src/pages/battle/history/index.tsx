import { useCallback, useMemo, useState } from 'react'
import { ProblemEditor, type ProblemEditorProps } from '@/components/problem-editor'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  useBattleResults,
  useDeleteBattleResult,
  useMe,
  useModels,
  useProblem,
  useProblems,
  useSyncBattleToCloud,
} from '@/hooks/useApi'
import { defaultAuthoringModelId } from '@/lib/authoring-model'
import type { BattleResultListItem, BattleSession } from '@/types'
import { useBattleDetailNav } from '@/context/battle-replay-nav'
import {
  loadLocalBattleHistory,
  removeLocalBattleEntry,
  type LocalBattleHistoryEntry,
} from '@/utils/battle-local-history'
import { loadBattleSyncPrefs, saveBattleSyncPrefs } from '@/utils/battle-sync-prefs'

type MergedRow = {
  id: string
  local: LocalBattleHistoryEntry | undefined
  cloud: BattleResultListItem | undefined
}

function mergeRows(local: LocalBattleHistoryEntry[], cloud: BattleResultListItem[]): MergedRow[] {
  const cloudMap = new Map(cloud.map((c) => [c.id, c]))
  const localMap = new Map(local.map((l) => [l.id, l]))
  const ids = new Set<string>([...localMap.keys(), ...cloudMap.keys()])
  return [...ids]
    .map((id) => ({
      id,
      local: localMap.get(id),
      cloud: cloudMap.get(id),
    }))
    .sort((a, b) => {
      const ta = Math.max(
        a.local ? new Date(a.local.savedAt).getTime() : 0,
        a.cloud ? new Date(a.cloud.createdAt).getTime() : 0,
      )
      const tb = Math.max(
        b.local ? new Date(b.local.savedAt).getTime() : 0,
        b.cloud ? new Date(b.cloud.createdAt).getTime() : 0,
      )
      return tb - ta
    })
}

function creatorLabel(
  cloud: BattleResultListItem | undefined,
  local: LocalBattleHistoryEntry | undefined,
): string {
  if (cloud?.creator) return cloud.creator.name ?? cloud.creator.login
  const s = local?.creatorSnapshot
  if (s) return s.name ?? s.login
  return '访客'
}

function creatorId(
  cloud: BattleResultListItem | undefined,
  local: LocalBattleHistoryEntry | undefined,
): string | null {
  return cloud?.creator?.id ?? local?.creatorSnapshot?.id ?? null
}

function outcomeLabel(cloud: BattleResultListItem | undefined, battle: BattleSession | undefined): string {
  const st = battle?.status ?? cloud?.status
  if (st === 'completed') return '成功'
  if (st === 'failed') return '失败'
  if (st === 'partial') return '部分完成'
  if (!st) return '—'
  return '其他'
}

type StorageFilter = 'all' | 'local' | 'cloud'

export function BattleHistory() {
  const { openBattleDetail } = useBattleDetailNav()
  const { data: meData } = useMe()
  const user = meData?.user ?? null
  const { data: models = [] } = useModels()
  const { data: problems = [] } = useProblems()
  const { data: cloudData, isLoading: cloudLoading } = useBattleResults()
  const cloudItems: BattleResultListItem[] = cloudData?.items ?? []

  const [localTick, setLocalTick] = useState(0)
  const localEntries = useMemo(() => {
    void localTick
    return loadLocalBattleHistory()
  }, [localTick])

  const refreshLocal = useCallback(() => setLocalTick((t) => t + 1), [])

  const [prefs, setPrefs] = useState(loadBattleSyncPrefs)
  const autoSyncWhenLoggedIn = prefs.autoSyncWhenLoggedIn
  const setAutoSyncWhenLoggedIn = (v: boolean) => {
    const next = saveBattleSyncPrefs({ autoSyncWhenLoggedIn: v })
    setPrefs(next)
  }

  const mergedAll = useMemo(() => mergeRows(localEntries, cloudItems), [localEntries, cloudItems])

  const [filterProblemId, setFilterProblemId] = useState<string>('__all__')
  const [filterModelId, setFilterModelId] = useState<string>('__all__')
  const [filterCreatorId, setFilterCreatorId] = useState<string>('__all__')
  const [filterStorage, setFilterStorage] = useState<StorageFilter>('all')

  const creatorOptions = useMemo(() => {
    const m = new Map<string, string>()
    for (const row of mergedAll) {
      const id = creatorId(row.cloud, row.local)
      if (!id) continue
      m.set(id, creatorLabel(row.cloud, row.local))
    }
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], 'zh-CN'))
  }, [mergedAll])

  const filteredRows = useMemo(() => {
    return mergedAll.filter((row) => {
      const pid = row.local?.battle.problemId ?? row.cloud?.problemId ?? ''
      if (filterProblemId !== '__all__' && pid !== filterProblemId) return false

      const ma = row.local?.battle.modelAId ?? row.cloud?.modelAId ?? ''
      const mb = row.local?.battle.modelBId ?? row.cloud?.modelBId ?? ''
      if (filterModelId !== '__all__' && filterModelId !== ma && filterModelId !== mb) return false

      if (filterCreatorId !== '__all__') {
        const cid = creatorId(row.cloud, row.local)
        if (cid !== filterCreatorId) return false
      }

      if (filterStorage === 'local' && !row.local) return false
      if (filterStorage === 'cloud' && !row.cloud) return false

      return true
    })
  }, [mergedAll, filterProblemId, filterModelId, filterCreatorId, filterStorage])

  const [problemDetailId, setProblemDetailId] = useState<string | null>(null)
  const problemDetailOpen = !!problemDetailId
  const problemDetailQuery = useProblem(problemDetailId ?? '', {
    enabled: problemDetailOpen,
  })
  const problemDetailSummary = problemDetailId
    ? problems.find((p) => p.id === problemDetailId)
    : undefined

  const problemTagCatalog = useMemo(() => {
    const s = new Set<string>()
    for (const p of problems) {
      for (const t of p.tags ?? []) s.add(t)
    }
    return Array.from(s).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
  }, [problems])

  const syncMutation = useSyncBattleToCloud()
  const deleteMutation = useDeleteBattleResult()
  const [rowSyncErr, setRowSyncErr] = useState<string | null>(null)
  const [deleteErr, setDeleteErr] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<MergedRow | null>(null)

  const modelName = (id: string) => models.find((m) => m.id === id)?.name ?? id

  const problemTitle = (id: string) => problems.find((p) => p.id === id)?.title ?? id

  const syncRow = (entry: LocalBattleHistoryEntry) => {
    if (!user) return
    setRowSyncErr(null)
    syncMutation.mutate(entry.battle, {
      onSuccess: () => {
        removeLocalBattleEntry(entry.battle.id)
        refreshLocal()
      },
      onError: (e) => {
        setRowSyncErr(e instanceof Error ? e.message : '同步失败')
      },
    })
  }

  const deleteConfirmDescription = (row: MergedRow) => {
    const hasCloud = !!row.cloud && !!user
    const hasLocal = !!row.local
    if (hasCloud && hasLocal) return '将同时移除云端与本地记录，此操作不可撤销。'
    if (hasCloud) return '将从云端删除该对战记录，此操作不可撤销。'
    return '将清除浏览器中本地保存的这条记录。'
  }

  const openDeleteDialog = (row: MergedRow) => {
    const hasCloud = !!row.cloud && !!user
    const hasLocal = !!row.local
    if (!hasCloud && !hasLocal) return
    setDeleteErr(null)
    setRowSyncErr(null)
    setDeleteTarget(row)
  }

  const confirmDelete = () => {
    if (!deleteTarget) return
    const row = deleteTarget
    const hasCloud = !!row.cloud && !!user
    const hasLocal = !!row.local

    setDeleteErr(null)
    setRowSyncErr(null)

    if (hasCloud) {
      deleteMutation.mutate(row.id, {
        onSuccess: () => {
          if (hasLocal) {
            removeLocalBattleEntry(row.id)
            refreshLocal()
          }
          setDeleteTarget(null)
        },
        onError: (e) => {
          setDeleteErr(e instanceof Error ? e.message : '删除失败')
        },
      })
    } else {
      removeLocalBattleEntry(row.id)
      refreshLocal()
      setDeleteTarget(null)
    }
  }

  const storageCell = (row: MergedRow) => {
    const hasL = !!row.local
    const hasC = !!row.cloud
    if (hasL && hasC) {
      return (
        <span className="text-xs text-muted-foreground">
          本地 + 云端
          <span className="sr-only">（同步完成后会移除本地副本）</span>
        </span>
      )
    }
    if (hasL) {
      return (
        <div className="flex flex-col items-center gap-1.5">
          <span className="inline-flex rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-800 dark:text-amber-200">
            本地
          </span>
          {!user ? <span className="text-xs text-muted-foreground">登录后可同步</span> : null}
        </div>
      )
    }
    if (hasC) {
      return (
        <span className="inline-flex rounded-md border border-sky-500/40 bg-sky-500/10 px-2 py-0.5 text-xs font-medium text-sky-900 dark:text-sky-100">
          云端
        </span>
      )
    }
    return '—'
  }

  const modelTags = (row: MergedRow) => {
    const ma = row.local?.battle.modelAId ?? row.cloud?.modelAId ?? ''
    const mb = row.local?.battle.modelBId ?? row.cloud?.modelBId ?? ''
    return (
      <div className="flex flex-wrap items-center justify-center gap-1.5">
        <span className="inline-flex max-w-[9rem] truncate rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-foreground">
          {modelName(ma)}
        </span>
        <span className="inline-flex max-w-[9rem] truncate rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-foreground">
          {modelName(mb)}
        </span>
      </div>
    )
  }

  const openProblemDetail = (problemId: string) => {
    if (!problemId) return
    setProblemDetailId(problemId)
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        从列表打开对战会进入对战页查看详情；已登录且保存在你账户下的云端对战可继续追问。同步到云端后会移除本地副本。
      </p>

      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-border"
            checked={autoSyncWhenLoggedIn}
            onChange={(e) => setAutoSyncWhenLoggedIn(e.target.checked)}
          />
          <span>登录后自动同步</span>
        </label>
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-border/80 bg-muted/15 p-3 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="grid gap-2 sm:min-w-[10rem]">
          <span className="text-xs font-medium text-muted-foreground">题目</span>
          <Select value={filterProblemId} onValueChange={setFilterProblemId}>
            <SelectTrigger className="h-9" aria-label="筛选题目">
              <SelectValue placeholder="全部题目" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">全部题目</SelectItem>
              {problems.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2 sm:min-w-[10rem]">
          <span className="text-xs font-medium text-muted-foreground">模型（任一侧）</span>
          <Select value={filterModelId} onValueChange={setFilterModelId}>
            <SelectTrigger className="h-9" aria-label="筛选模型">
              <SelectValue placeholder="全部模型" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">全部模型</SelectItem>
              {models.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2 sm:min-w-[10rem]">
          <span className="text-xs font-medium text-muted-foreground">创建者</span>
          <Select value={filterCreatorId} onValueChange={setFilterCreatorId}>
            <SelectTrigger className="h-9" aria-label="筛选创建者">
              <SelectValue placeholder="全部创建者" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">全部创建者</SelectItem>
              {creatorOptions.map(([id, label]) => (
                <SelectItem key={id} value={id}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2 sm:min-w-[10rem]">
          <span className="text-xs font-medium text-muted-foreground">本地 / 云端</span>
          <Select
            value={filterStorage}
            onValueChange={(v) => setFilterStorage(v as StorageFilter)}
          >
            <SelectTrigger className="h-9" aria-label="筛选存储位置">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部</SelectItem>
              <SelectItem value="local">本地</SelectItem>
              <SelectItem value="cloud">仅云端</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {rowSyncErr ? (
        <p className="text-sm text-destructive" role="alert">
          {rowSyncErr}
        </p>
      ) : null}
      {deleteErr ? (
        <p className="text-sm text-destructive" role="alert">
          {deleteErr}
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[52rem] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="px-3 py-2.5 align-middle font-medium">题目</th>
              <th className="px-3 py-2.5 text-center align-middle font-medium">模型</th>
              <th className="px-3 py-2.5 text-center align-middle font-medium">结果</th>
              <th className="px-3 py-2.5 text-center align-middle font-medium">创建者</th>
              <th className="px-3 py-2.5 text-center align-middle font-medium">存储</th>
              <th className="px-3 py-2.5 text-center align-middle font-medium">操作</th>
              <th className="px-3 py-2.5 text-end align-middle font-medium">时间</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                  没有符合条件的记录。
                </td>
              </tr>
            ) : (
              filteredRows.map((row) => {
                const pid = row.local?.battle.problemId ?? row.cloud?.problemId ?? ''
                const title = problemTitle(pid)
                const t = row.local?.savedAt ?? row.cloud?.createdAt ?? ''

                return (
                  <tr key={row.id} className="border-b border-border/80">
                    <td className="max-w-[14rem] align-middle px-3 py-2">
                      <button
                        type="button"
                        className="w-full text-left font-medium text-foreground hover:text-primary"
                        onClick={() => openProblemDetail(pid)}
                        disabled={!pid}
                      >
                        <span className="break-words">{title}</span>
                      </button>
                    </td>
                    <td className="align-middle px-3 py-2">{modelTags(row)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-center align-middle">
                      {outcomeLabel(row.cloud, row.local?.battle)}
                    </td>
                    <td className="px-3 py-2 text-center align-middle">{creatorLabel(row.cloud, row.local)}</td>
                    <td className="max-w-[10rem] px-3 py-2 text-center align-middle">{storageCell(row)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-center align-middle">
                      <div className="flex flex-wrap items-center justify-center gap-1.5">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8"
                          disabled={!row.local && !row.cloud}
                          onClick={() => openBattleDetail(row.id)}
                        >
                          详情
                        </Button>
                        {row.local && user ? (
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            className="h-8"
                            disabled={syncMutation.isPending || deleteMutation.isPending}
                            onClick={() => syncRow(row.local!)}
                          >
                            {syncMutation.isPending ? '同步中…' : '同步到云端'}
                          </Button>
                        ) : null}
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                          disabled={
                            deleteMutation.isPending ||
                            syncMutation.isPending ||
                            (!row.local && !row.cloud)
                          }
                          onClick={() => openDeleteDialog(row)}
                        >
                          {deleteMutation.isPending ? '删除中…' : '删除'}
                        </Button>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-end align-middle text-muted-foreground">
                      {t ? new Date(t).toLocaleString() : '—'}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {cloudLoading ? (
        <p className="text-xs text-muted-foreground">正在加载云端列表…</p>
      ) : null}

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除对战记录</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget ? deleteConfirmDescription(deleteTarget) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>取消</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              className="sm:mt-0"
              disabled={deleteMutation.isPending}
              onClick={confirmDelete}
            >
              {deleteMutation.isPending ? '删除中…' : '删除'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {problemDetailOpen && problemDetailId ? (
        <ProblemEditor
          open={problemDetailOpen}
          onOpenChange={(open) => {
            if (!open) setProblemDetailId(null)
          }}
          title="题目详情"
          titleId="battle-history-problem-detail-title"
          mode="edit"
          problemId={problemDetailId}
          detail={problemDetailQuery.data ?? null}
          loading={problemDetailQuery.isLoading}
          loadFailed={problemDetailQuery.isError}
          problemSummary={problemDetailSummary}
          models={models}
          defaultModelId={defaultAuthoringModelId(models)}
          tagSuggestions={problemTagCatalog}
          viewOnly
          onCancel={() => setProblemDetailId(null)}
          cancelLabel="关闭"
          submitLabel="保存全部"
          onConfirm={async (_args: Parameters<NonNullable<ProblemEditorProps['onConfirm']>>[0]) => {}}
        />
      ) : null}
    </div>
  )
}
