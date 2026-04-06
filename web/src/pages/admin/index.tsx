import { useQuery } from '@tanstack/react-query'
import { api } from '@/api/client'

type Tab = 'models' | 'logs'

type Props = {
  tab: Tab
  onTabChange: (t: Tab) => void
}

export function Admin({ tab, onTabChange }: Props) {
  const modelsQ = useQuery({
    queryKey: ['admin', 'models'],
    queryFn: () => api.getAdminModels(),
    enabled: tab === 'models',
  })
  const logsQ = useQuery({
    queryKey: ['admin', 'logs'],
    queryFn: () => api.getAdminLogs(),
    enabled: tab === 'logs',
  })

  return (
    <div className="flex min-h-[20rem] gap-6">
      <nav className="flex w-44 shrink-0 flex-col gap-0.5" aria-label="后台">
        <button
          type="button"
          onClick={() => onTabChange('models')}
          className={`rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors ${
            tab === 'models'
              ? 'bg-arena-sidebar-active text-arena-sidebar-active-fg shadow-arena'
              : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
          }`}
        >
          模型管理
        </button>
        <button
          type="button"
          onClick={() => onTabChange('logs')}
          className={`rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors ${
            tab === 'logs'
              ? 'bg-arena-sidebar-active text-arena-sidebar-active-fg shadow-arena'
              : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
          }`}
        >
          日志管理
        </button>
      </nav>
      <div className="min-w-0 flex-1 rounded-lg border border-border/80 bg-muted/10 p-6">
        {tab === 'models' && (
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-foreground">模型管理</h2>
            <p className="text-sm text-muted-foreground">
              新建、启用与禁用模型请在侧边栏「排行榜」页面操作（需管理员权限）。
            </p>
            {modelsQ.isLoading && <p className="text-sm text-muted-foreground">加载中…</p>}
            {modelsQ.isError && (
              <p className="text-sm text-destructive">{(modelsQ.error as Error).message}</p>
            )}
            {modelsQ.isSuccess && (
              <div className="overflow-x-auto rounded-md border border-border/80 bg-background/50">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/80 text-left">
                      <th className="px-3 py-2 font-medium">ID</th>
                      <th className="px-3 py-2 font-medium">名称</th>
                      <th className="px-3 py-2 font-medium">厂商</th>
                      <th className="px-3 py-2 font-medium">状态</th>
                    </tr>
                  </thead>
                  <tbody>
                    {modelsQ.data.models.map((m) => (
                      <tr key={m.id} className="border-b border-border/60 last:border-0">
                        <td className="px-3 py-2 font-mono text-xs">{m.id}</td>
                        <td className="px-3 py-2">{m.name}</td>
                        <td className="px-3 py-2">{m.provider}</td>
                        <td className="px-3 py-2">
                          {m.enabled ? '启用' : '已禁用'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
        {tab === 'logs' && (
          <div className="space-y-2">
            <h2 className="text-sm font-semibold text-foreground">日志管理</h2>
            {logsQ.isLoading && <p className="text-sm text-muted-foreground">加载中…</p>}
            {logsQ.isError && (
              <p className="text-sm text-destructive">{(logsQ.error as Error).message}</p>
            )}
            {logsQ.isSuccess && (
              <p className="text-sm text-muted-foreground">{logsQ.data.message}</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
