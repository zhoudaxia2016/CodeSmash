import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  useAdminModels,
  useCreateAdminModel,
  useDeleteAdminModel,
  useLeaderboard,
  useMe,
  usePatchAdminModel,
  useProblems,
} from '@/hooks/useApi'
import type { LeaderboardEntry } from '@/types'

function pct(n: number): string {
  if (!Number.isFinite(n)) return '—'
  return `${(n * 100).toFixed(1)}%`
}

const inputClass =
  'h-9 w-full rounded-md border border-border/80 bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40'

type SortCol = 'passRate' | 'avgTimeMs'

function sortEntries(
  entries: LeaderboardEntry[],
  sortCol: SortCol,
  sortDir: 'asc' | 'desc',
): LeaderboardEntry[] {
  const list = [...entries]
  const factor = sortDir === 'desc' ? -1 : 1
  list.sort((a, b) => {
    if (sortCol === 'passRate') {
      if (a.passRate !== b.passRate) return factor * (a.passRate > b.passRate ? 1 : -1)
    } else {
      const hasA = a.battleCount > 0
      const hasB = b.battleCount > 0
      if (!hasA && !hasB) {
        /* keep stable */
      } else if (!hasA) return 1
      else if (!hasB) return -1
      else if (a.avgTimeMs !== b.avgTimeMs) {
        return factor * (a.avgTimeMs > b.avgTimeMs ? 1 : -1)
      }
    }
    return a.modelName.localeCompare(b.modelName, undefined, { sensitivity: 'base' })
  })
  return list
}

function SortableTh({
  label,
  active,
  dir,
  onClick,
  className,
}: {
  label: string
  active: boolean
  dir: 'asc' | 'desc'
  onClick: () => void
  className?: string
}) {
  return (
    <th className={className}>
      <button
        type="button"
        onClick={onClick}
        className="inline-flex items-center gap-1 font-medium text-foreground hover:text-foreground/90"
      >
        {label}
        {active ? (
          <span className="text-muted-foreground tabular-nums text-xs" aria-hidden>
            {dir === 'desc' ? '↓' : '↑'}
          </span>
        ) : null}
      </button>
    </th>
  )
}

export function LeaderboardPage() {
  const { data: meData } = useMe()
  const user = meData?.user ?? null
  const isAdmin = user?.role === 'admin'

  const [problemId, setProblemId] = useState<string>('')
  const [scope, setScope] = useState<'all' | 'mine'>('all')
  const [sortCol, setSortCol] = useState<SortCol>('passRate')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  useEffect(() => {
    if (scope === 'mine' && !user) setScope('all')
  }, [scope, user])

  const { data: problems = [] } = useProblems()
  const lb = useLeaderboard({
    problemId: problemId || undefined,
    scope,
  })

  const adminModelsQ = useAdminModels(isAdmin)
  const createModel = useCreateAdminModel()
  const patchModel = usePatchAdminModel()
  const deleteModel = useDeleteAdminModel()

  const [newId, setNewId] = useState('')
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newProvider, setNewProvider] = useState<'minimax' | 'deepseek'>('deepseek')

  const handleCreate = (e: FormEvent) => {
    e.preventDefault()
    const id = newId.trim()
    const name = newName.trim()
    if (!id || !name) return
    createModel.mutate(
      {
        id,
        name,
        description: newDesc.trim(),
        provider: newProvider,
      },
      {
        onSuccess: () => {
          setNewId('')
          setNewName('')
          setNewDesc('')
        },
      },
    )
  }

  const entries = lb.data?.entries ?? []
  const displayEntries = useMemo(
    () => sortEntries(entries, sortCol, sortDir),
    [entries, sortCol, sortDir],
  )

  const toggleSort = (col: SortCol) => {
    if (sortCol === col) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))
    } else {
      setSortCol(col)
      setSortDir(col === 'passRate' ? 'desc' : 'asc')
    }
  }

  const scopeBtnClass =
    'h-9 min-w-[5.5rem] px-3 text-sm font-semibold transition-colors'

  return (
    <div className="space-y-10">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <div
            className="flex rounded-lg border border-border/80 p-1 bg-muted/50"
            role="group"
            aria-label="数据范围"
          >
            <button
              type="button"
              className={`${scopeBtnClass} rounded-md ${
                scope === 'all'
                  ? 'bg-primary text-primary-foreground shadow-md shadow-primary/25'
                  : 'text-muted-foreground hover:bg-background/80 hover:text-foreground'
              }`}
              onClick={() => setScope('all')}
            >
              全站
            </button>
            <button
              type="button"
              className={`${scopeBtnClass} rounded-md ${
                scope === 'mine'
                  ? 'bg-primary text-primary-foreground shadow-md shadow-primary/25'
                  : 'text-muted-foreground hover:bg-background/80 hover:text-foreground'
              }`}
              disabled={!user}
              title={!user ? '请先登录' : undefined}
              onClick={() => setScope('mine')}
            >
              我的
            </button>
          </div>
          <div className="min-w-[12rem] max-w-md flex-1">
            <Select
              value={problemId || '__all__'}
              onValueChange={(v) => setProblemId(v === '__all__' ? '' : v)}
            >
              <SelectTrigger className="h-9">
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
        </div>

        {lb.isLoading && <p className="text-sm text-muted-foreground">加载中…</p>}
        {lb.isError && <p className="text-sm text-destructive">{(lb.error as Error).message}</p>}
        {lb.isSuccess && entries.length === 0 && (
          <p className="text-sm text-muted-foreground">暂无统计数据。</p>
        )}
        {lb.isSuccess && entries.length > 0 && (
          <div className="overflow-x-auto rounded-md border border-border/80">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/80 bg-muted/30 text-left">
                  <th className="px-3 py-2 font-medium">模型</th>
                  <SortableTh
                    label="通过率"
                    active={sortCol === 'passRate'}
                    dir={sortDir}
                    onClick={() => toggleSort('passRate')}
                    className="px-3 py-2"
                  />
                  <SortableTh
                    label="场均官方耗时"
                    active={sortCol === 'avgTimeMs'}
                    dir={sortDir}
                    onClick={() => toggleSort('avgTimeMs')}
                    className="px-3 py-2"
                  />
                  <th className="px-3 py-2 font-medium">场次</th>
                  <th className="px-3 py-2 font-medium">自测质量</th>
                </tr>
              </thead>
              <tbody>
                {displayEntries.map((row) => (
                  <tr key={row.modelId} className="border-b border-border/60 last:border-0">
                    <td className="px-3 py-2">
                      <div className="font-medium text-foreground">{row.modelName}</div>
                      <div className="text-xs text-muted-foreground font-mono">{row.modelId}</div>
                    </td>
                    <td className="px-3 py-2 tabular-nums">{pct(row.passRate)}</td>
                    <td className="px-3 py-2 tabular-nums">
                      {row.battleCount > 0 ? `${row.avgTimeMs} ms` : '—'}
                    </td>
                    <td className="px-3 py-2 tabular-nums">{row.battleCount}</td>
                    <td className="px-3 py-2 tabular-nums">{pct(row.selfTestQuality)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {isAdmin && (
        <div className="space-y-4 border-t border-border/80 pt-8">
          <h2 className="text-sm font-semibold text-foreground">模型管理</h2>
          <form onSubmit={handleCreate} className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <label htmlFor="lb-new-id" className="text-xs text-muted-foreground">
                ID
              </label>
              <input
                id="lb-new-id"
                className={`${inputClass} w-40 font-mono`}
                value={newId}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setNewId(e.target.value)}
                placeholder="e.g. deepseek-alt"
                autoComplete="off"
              />
            </div>
            <div className="space-y-1 min-w-[8rem] flex-1">
              <label htmlFor="lb-new-name" className="text-xs text-muted-foreground">
                名称
              </label>
              <input
                id="lb-new-name"
                className={inputClass}
                value={newName}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setNewName(e.target.value)}
                placeholder="展示名"
              />
            </div>
            <div className="space-y-1 min-w-[12rem] flex-1">
              <label htmlFor="lb-new-desc" className="text-xs text-muted-foreground">
                描述
              </label>
              <input
                id="lb-new-desc"
                className={inputClass}
                value={newDesc}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setNewDesc(e.target.value)}
                placeholder="可选"
              />
            </div>
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">厂商</span>
              <Select
                value={newProvider}
                onValueChange={(v) => setNewProvider(v as 'minimax' | 'deepseek')}
              >
                <SelectTrigger className="h-9 w-[9rem]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="deepseek">deepseek</SelectItem>
                  <SelectItem value="minimax">minimax</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" className="h-9" disabled={createModel.isPending}>
              {createModel.isPending ? '提交中…' : '新建'}
            </Button>
          </form>
          {createModel.isError && (
            <p className="text-sm text-destructive">{(createModel.error as Error).message}</p>
          )}

          {adminModelsQ.isLoading && <p className="text-sm text-muted-foreground">加载模型列表…</p>}
          {adminModelsQ.isError && (
            <p className="text-sm text-destructive">{(adminModelsQ.error as Error).message}</p>
          )}
          {adminModelsQ.isSuccess && (
            <div className="overflow-x-auto rounded-md border border-border/80">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/80 bg-muted/30 text-left">
                    <th className="px-3 py-2 font-medium">ID</th>
                    <th className="px-3 py-2 font-medium">名称</th>
                    <th className="px-3 py-2 font-medium">厂商</th>
                    <th className="px-3 py-2 font-medium">状态</th>
                    <th className="px-3 py-2 font-medium w-[8rem]">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {(adminModelsQ.data?.models ?? []).map((m) => (
                    <tr key={m.id} className="border-b border-border/60 last:border-0">
                      <td className="px-3 py-2 font-mono text-xs">{m.id}</td>
                      <td className="px-3 py-2">{m.name}</td>
                      <td className="px-3 py-2">{m.provider}</td>
                      <td className="px-3 py-2">
                        {m.enabled ? (
                          <span className="text-emerald-600 dark:text-emerald-400">启用</span>
                        ) : (
                          <span className="text-muted-foreground">已禁用</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {m.enabled ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8"
                            disabled={deleteModel.isPending}
                            onClick={() => deleteModel.mutate(m.id)}
                          >
                            禁用
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8"
                            disabled={patchModel.isPending}
                            onClick={() => patchModel.mutate({ id: m.id, patch: { enabled: true } })}
                          >
                            启用
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
