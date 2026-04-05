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
          <div className="space-y-2">
            <h2 className="text-sm font-semibold text-foreground">模型管理</h2>
            {modelsQ.isLoading && <p className="text-sm text-muted-foreground">加载中…</p>}
            {modelsQ.isError && (
              <p className="text-sm text-destructive">{(modelsQ.error as Error).message}</p>
            )}
            {modelsQ.isSuccess && (
              <p className="text-sm text-muted-foreground">{modelsQ.data.message}</p>
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
