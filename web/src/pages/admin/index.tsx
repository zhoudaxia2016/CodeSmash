import { type ChangeEvent, type FormEvent, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/api/client'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import {
  useCreateAdminModel,
  useDeleteAdminModel,
  usePatchAdminModel,
} from '@/hooks/useApi'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { AdminLogs } from '@/pages/admin/logs'
import { Header } from '@/layout/header'
import { MobileHeader } from '@/layout/mobile-header'

type Tab = 'models' | 'logs'

type Props = {
  tab: Tab
}

const inputClass =
  'h-9 w-full rounded-md border border-border/80 bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40'

export function Admin({ tab }: Props) {
  const isMobile = useMediaQuery('(max-width: 1023px)')
  const modelsQ = useQuery({
    queryKey: ['admin', 'models'],
    queryFn: () => api.getAdminModels(),
    enabled: tab === 'models',
  })
  const createModel = useCreateAdminModel()
  const patchModel = usePatchAdminModel()
  const deleteModel = useDeleteAdminModel()

  const [newName, setNewName] = useState('')
  const [newProvider, setNewProvider] = useState<'minimax' | 'deepseek' | 'bigmodel'>('deepseek')

  const handleCreate = (e: FormEvent) => {
    e.preventDefault()
    const name = newName.trim()
    if (!name) return
    createModel.mutate(
      {
        name,
        provider: newProvider,
      },
      {
        onSuccess: () => {
          setNewName('')
        },
      },
    )
  }

  const adminBusy = patchModel.isPending || deleteModel.isPending

  return (
    <div className="min-w-0 space-y-6">
      {isMobile ? (
        <MobileHeader title={tab === 'logs' ? '日志' : '模型'} />
      ) : (
        <Header title={tab === 'logs' ? '日志' : '模型'} />
      )}

      <div className="space-y-6">
        {tab === 'models' && (
          <div className="space-y-4">
            <form onSubmit={handleCreate} className="flex flex-wrap items-end gap-3">
              <div className="min-w-[8rem] flex-1 space-y-1">
                <label htmlFor="adm-new-name" className="text-xs text-muted-foreground">
                  模型名
                </label>
                <input
                  id="adm-new-name"
                  className={`${inputClass} font-mono text-xs`}
                  value={newName}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setNewName(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">厂商</span>
                <Select
                  value={newProvider}
                  onValueChange={(v) => setNewProvider(v as 'minimax' | 'deepseek' | 'bigmodel')}
                >
                  <SelectTrigger className="h-9 w-[9rem]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="deepseek">deepseek</SelectItem>
                    <SelectItem value="minimax">minimax</SelectItem>
                    <SelectItem value="bigmodel">bigmodel（智谱）</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" className="h-9" disabled={createModel.isPending || !newName.trim()}>
                {createModel.isPending ? '提交中…' : '新建'}
              </Button>
            </form>
            {createModel.isError && (
              <p className="text-sm text-destructive">{(createModel.error as Error).message}</p>
            )}

            {modelsQ.isLoading && <p className="text-sm text-muted-foreground">加载中…</p>}
            {modelsQ.isError && (
              <p className="text-sm text-destructive">{(modelsQ.error as Error).message}</p>
            )}
            {modelsQ.isSuccess && (
              <div className="overflow-x-auto rounded-md border border-border/80 bg-background/50">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/80 text-left">
                      <th className="px-3 py-2 font-medium">模型名</th>
                      <th className="px-3 py-2 font-medium">厂商</th>
                      <th className="px-3 py-2 font-medium">状态</th>
                      <th className="w-[4.5rem] px-3 py-2 font-medium">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {modelsQ.data.models.map((m) => (
                      <tr key={m.id} className="border-b border-border/60 last:border-0">
                        <td className="px-3 py-2 font-mono text-xs text-foreground">{m.name}</td>
                        <td className="px-3 py-2">{m.provider}</td>
                        <td className="px-3 py-2">
                          <Switch
                            checked={m.enabled}
                            disabled={adminBusy}
                            onCheckedChange={(next) =>
                              patchModel.mutate({ id: m.id, patch: { enabled: next } })
                            }
                            aria-label={m.enabled ? '已启用' : '已禁用'}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            disabled={adminBusy}
                            onClick={() => {
                              if (
                                !confirm(
                                  '确定删除该模型？若对战记录引用了该模型 id，历史展示可能异常；此操作不可恢复。',
                                )
                              ) {
                                return
                              }
                              deleteModel.mutate(m.id)
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
            )}
          </div>
        )}
        {tab === 'logs' && <AdminLogs />}
      </div>
    </div>
  )
}
