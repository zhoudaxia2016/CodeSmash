import type { Problem } from '@/types'
import { Button } from '@/components/ui/button'

type Props = {
  items: Problem[]
  onRowActivate: (id: string) => void
  onDelete: (p: Problem) => void
  deletePending?: boolean
}

function formatUpdatedAt(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

export function ProblemList({ items, onRowActivate, onDelete, deletePending }: Props) {
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table
        className="w-full min-w-[48rem] border-collapse text-left text-sm"
        aria-label="题目列表"
      >
        <thead>
          <tr className="border-b border-border bg-muted/50">
            <th scope="col" className="px-3 py-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              标题
            </th>
            <th
              scope="col"
              className="px-3 py-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground"
            >
              标签
            </th>
            <th
              scope="col"
              className="w-24 whitespace-nowrap px-3 py-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground"
            >
              模式
            </th>
            <th
              scope="col"
              className="w-40 whitespace-nowrap px-3 py-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground"
            >
              更新于
            </th>
            <th
              scope="col"
              className="w-24 whitespace-nowrap px-3 py-2.5 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground"
            >
              删除
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((p) => (
            <tr
              key={p.id}
              tabIndex={0}
              aria-label={`打开编辑：${p.title}`}
              className="cursor-pointer border-b border-border last:border-b-0 transition-colors hover:bg-muted/25 focus-visible:bg-muted/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
              onClick={() => onRowActivate(p.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onRowActivate(p.id)
                }
              }}
            >
              <td className="max-w-[20rem] px-3 py-2.5 align-top">
                <div className="font-medium text-foreground">{p.title}</div>
                {p.description ? (
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{p.description}</p>
                ) : null}
              </td>
              <td className="px-3 py-2.5 align-top">
                {(p.tags?.length ?? 0) > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {p.tags!.map((t) => (
                      <span
                        key={t}
                        className="inline-block rounded bg-secondary/80 px-1.5 py-0.5 text-xs text-secondary-foreground"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 align-top">
                <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-medium uppercase text-muted-foreground">
                  {p.gradingMode === 'verify' ? 'verify' : 'expected'}
                </span>
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 align-top text-xs text-muted-foreground">
                {formatUpdatedAt(p.updatedAt)}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 align-top text-right">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 text-muted-foreground hover:bg-muted hover:text-foreground"
                  disabled={deletePending}
                  aria-label={`删除「${p.title}」`}
                  onClick={(e) => {
                    e.stopPropagation()
                    onDelete(p)
                  }}
                >
                  删除
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
