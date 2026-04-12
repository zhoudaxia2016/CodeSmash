import { useEffect, useMemo, useState } from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useQueryClient } from '@tanstack/react-query'
import { useLeaderboard, useMe, useProblems } from '@/hooks/useApi'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import type { LeaderboardEntry } from '@/types'
import { Header } from '@/layout/Header'
import { MobileHeader } from '@/layout/MobileHeader'

function pct(n: number): string {
  if (!Number.isFinite(n)) return '—'
  return `${(n * 100).toFixed(1)}%`
}

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
  const isMobile = useMediaQuery('(max-width: 1023px)')
  const queryClient = useQueryClient()
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
    <div className="space-y-4">
      {isMobile ? (
        <MobileHeader title="排行榜" />
      ) : (
        <Header title="排行榜" />
      )}

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

        {user && !isAdmin && (
          <p className="text-xs text-muted-foreground">
            模型配置在侧边栏「管理后台」→「模型」。请在{' '}
            <code className="rounded bg-muted/80 px-1 py-0.5 font-mono text-[11px]">server/.env</code>{' '}
            配置 <code className="rounded bg-muted/80 px-1 py-0.5 font-mono text-[11px]">ADMIN_GITHUB_IDS</code>{' '}
            为你的 GitHub 数字 id；确保用{' '}
            <code className="rounded bg-muted/80 px-1 py-0.5 font-mono text-[11px]">deno task dev</code>{' '}
            启动 API 以加载 .env，然后
            <button
              type="button"
              className="mx-0.5 underline decoration-muted-foreground/60 underline-offset-2 hover:text-foreground"
              onClick={() => void queryClient.invalidateQueries({ queryKey: ['me'] })}
            >
              刷新会话
            </button>
            。
          </p>
        )}

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
                    <td className="px-3 py-2 font-medium text-foreground">{row.modelName}</td>
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
    </div>
  )
}
