import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { endOfDay, format, startOfDay } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import { Calendar as CalendarIcon, ChevronDown } from 'lucide-react'
import { api } from '@/api/client'
import { MarkdownViewer } from '@/components/markdown-viewer'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { AdminLlmCallLogsQuery } from '@/types'
import { formatAdminLogTableTime } from './lib/format-admin-log-time'
import {
  outputJsonToMarkdownFields,
  parseLlmCallMessages,
  parseLlmOutputMode,
} from './lib/admin-llm-call-log'

const inputClass =
  'h-9 w-full rounded-md border border-border/80 bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40'

const PAGE_SIZE = 50

type DetailPane = 'messages' | 'output' | null

const SOURCE_TAG_CLASS: Record<string, string> = {
  battle_analysis: 'border-sky-500/35 bg-sky-500/12 text-sky-700 dark:text-sky-300',
  battle_code: 'border-cyan-500/35 bg-cyan-500/12 text-cyan-800 dark:text-cyan-300',
  llm_try_analysis: 'border-violet-500/35 bg-violet-500/12 text-violet-800 dark:text-violet-300',
  llm_try_code: 'border-purple-500/35 bg-purple-500/12 text-purple-800 dark:text-purple-300',
  test_case_generate: 'border-amber-500/40 bg-amber-500/12 text-amber-900 dark:text-amber-200',
  problem_authoring: 'border-emerald-500/35 bg-emerald-500/12 text-emerald-800 dark:text-emerald-300',
  other: 'border-border bg-muted/60 text-muted-foreground',
}

const PROVIDER_TAG_CLASS: Record<string, string> = {
  deepseek: 'border-emerald-500/35 bg-emerald-500/12 text-emerald-800 dark:text-emerald-300',
  minimax: 'border-violet-500/35 bg-violet-500/12 text-violet-800 dark:text-violet-300',
  bigmodel: 'border-rose-500/35 bg-rose-500/12 text-rose-800 dark:text-rose-300',
}

const DEFAULT_TAG_CLASS = 'border-border bg-muted/50 text-foreground'

function sourceTagClass(source: string): string {
  return SOURCE_TAG_CLASS[source] ?? DEFAULT_TAG_CLASS
}

function providerTagClass(provider: string): string {
  return PROVIDER_TAG_CLASS[provider] ?? DEFAULT_TAG_CLASS
}

function outputFieldLabel(key: string): string {
  const map: Record<string, string> = {
    content: '正文',
    reasoning_content: '推理内容',
    reasoning_details: '推理细节',
    thinking: '思考',
    truncated: '截断标记',
  }
  return map[key] ?? key
}

type LogDateFieldProps = {
  label: string
  value: Date | undefined
  onChange: (d: Date | undefined) => void
  placeholder: string
}

function LogDateField({ label, value, onChange, placeholder }: LogDateFieldProps) {
  const [open, setOpen] = useState(false)
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">{label}</span>
        {value != null && (
          <button
            type="button"
            className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            onClick={() => onChange(undefined)}
          >
            清除
          </button>
        )}
      </div>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="h-9 w-full justify-between font-normal data-[empty=true]:text-muted-foreground"
            data-empty={value == null}
          >
            <span className="flex min-w-0 items-center gap-2">
              <CalendarIcon className="h-4 w-4 shrink-0 opacity-60" aria-hidden />
              {value ? (
                <span className="truncate">{format(value, 'yyyy/M/d', { locale: zhCN })}</span>
              ) : (
                <span>{placeholder}</span>
              )}
            </span>
            <ChevronDown className="h-4 w-4 shrink-0 opacity-50" aria-hidden />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            locale={zhCN}
            selected={value}
            defaultMonth={value}
            onSelect={(d) => {
              onChange(d)
              setOpen(false)
            }}
          />
        </PopoverContent>
      </Popover>
    </div>
  )
}

export function AdminLogs() {
  const [fromDate, setFromDate] = useState<Date | undefined>(undefined)
  const [toDate, setToDate] = useState<Date | undefined>(undefined)
  const [source, setSource] = useState<string>('')
  const [sourceId, setSourceId] = useState('')
  const [provider, setProvider] = useState<string>('')
  const [model, setModel] = useState('')
  const [qMessages, setQMessages] = useState('')
  const [qOutput, setQOutput] = useState('')
  const [page, setPage] = useState(0)

  const [applied, setApplied] = useState<AdminLlmCallLogsQuery>(() => ({
    type: 'llm_call',
    limit: PAGE_SIZE,
    offset: 0,
  }))

  const listQ = useQuery({
    queryKey: ['admin', 'logs', applied],
    queryFn: () => api.getAdminLogs(applied),
  })

  const meta = listQ.data?.meta
  const total = listQ.data?.total ?? 0
  const items = listQ.data?.items ?? []
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const [detailId, setDetailId] = useState<string | null>(null)
  const [detailPane, setDetailPane] = useState<DetailPane>(null)

  const detailQ = useQuery({
    queryKey: ['admin', 'logs', 'llm-call', detailId],
    queryFn: () => api.getAdminLlmCallLog(detailId!),
    enabled: Boolean(detailId && detailPane),
  })

  const messageRows = useMemo(() => {
    const raw = detailQ.data?.item?.messages
    if (raw == null) return []
    return parseLlmCallMessages(raw)
  }, [detailQ.data?.item?.messages])

  const outputFields = useMemo(() => {
    return outputJsonToMarkdownFields(detailQ.data?.item?.outputJson ?? null)
  }, [detailQ.data?.item?.outputJson])

  const outputMode = useMemo(
    () => parseLlmOutputMode(detailQ.data?.item?.outputJson ?? null),
    [detailQ.data?.item?.outputJson],
  )

  useEffect(() => {
    if (detailPane == null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setDetailPane(null)
        setDetailId(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [detailPane])

  const applyFilters = () => {
    const from = fromDate != null ? startOfDay(fromDate).toISOString() : undefined
    const to = toDate != null ? endOfDay(toDate).toISOString() : undefined
    setPage(0)
    setApplied({
      type: 'llm_call',
      from,
      to,
      source: source || undefined,
      source_id: sourceId.trim() || undefined,
      provider: provider || undefined,
      model: model.trim() || undefined,
      q_messages: qMessages.trim() || undefined,
      q_output: qOutput.trim() || undefined,
      limit: PAGE_SIZE,
      offset: 0,
    })
  }

  const goPage = (next: number) => {
    const p = Math.max(0, Math.min(next, pageCount - 1))
    setPage(p)
    setApplied((prev) => ({
      ...prev,
      limit: PAGE_SIZE,
      offset: p * PAGE_SIZE,
    }))
  }

  const openDetail = (id: string, pane: Exclude<DetailPane, null>) => {
    setDetailId(id)
    setDetailPane(pane)
  }

  const closeDetail = () => {
    setDetailPane(null)
    setDetailId(null)
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        当前类型：<span className="font-mono text-foreground">llm_call</span>
        （后续可扩展其它日志类型）
      </p>

      <div className="grid gap-3 rounded-md border border-border/80 bg-background/50 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <div className="sm:col-span-2">
          <LogDateField
            label="开始日期"
            value={fromDate}
            onChange={setFromDate}
            placeholder="选择开始日期"
          />
        </div>
        <div className="sm:col-span-2">
          <LogDateField
            label="结束日期"
            value={toDate}
            onChange={setToDate}
            placeholder="选择结束日期"
          />
        </div>
        <div className="space-y-1">
          <span className="text-xs text-muted-foreground">source</span>
          <Select value={source || '__all__'} onValueChange={(v) => setSource(v === '__all__' ? '' : v)}>
            <SelectTrigger className="h-9">
              <SelectValue placeholder="全部" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">全部</SelectItem>
              {(meta?.llmSources ?? []).map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">source_id</label>
          <input
            className={`${inputClass} font-mono text-xs`}
            value={sourceId}
            onChange={(e) => setSourceId(e.target.value)}
            placeholder="包含匹配"
          />
        </div>
        <div className="space-y-1">
          <span className="text-xs text-muted-foreground">provider</span>
          <Select value={provider || '__all__'} onValueChange={(v) => setProvider(v === '__all__' ? '' : v)}>
            <SelectTrigger className="h-9">
              <SelectValue placeholder="全部" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">全部</SelectItem>
              {(meta?.llmProviders ?? []).map((p) => (
                <SelectItem key={p} value={p}>
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">model</label>
          <input
            className={`${inputClass} font-mono text-xs`}
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="包含匹配"
          />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <label className="text-xs text-muted-foreground">messages 搜索</label>
          <input
            className={`${inputClass} font-mono text-xs`}
            value={qMessages}
            onChange={(e) => setQMessages(e.target.value)}
            placeholder="在 messages JSON 中搜索子串"
          />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <label className="text-xs text-muted-foreground">output_json 搜索</label>
          <input
            className={`${inputClass} font-mono text-xs`}
            value={qOutput}
            onChange={(e) => setQOutput(e.target.value)}
            placeholder="在 output_json 中搜索子串"
          />
        </div>
        <div className="flex items-end sm:col-span-2 lg:col-span-3 xl:col-span-4">
          <Button type="button" className="h-9" onClick={() => void applyFilters()}>
            查询
          </Button>
        </div>
      </div>

      {listQ.isLoading && <p className="text-sm text-muted-foreground">加载中…</p>}
      {listQ.isError && (
        <p className="text-sm text-destructive">{(listQ.error as Error).message}</p>
      )}
      {listQ.isSuccess && listQ.data.type !== 'llm_call' && (
        <p className="text-sm text-muted-foreground">
          暂不支持的类型：{listQ.data.type}。支持：{listQ.data.supportedTypes.join(', ')}
        </p>
      )}
      {listQ.isSuccess && listQ.data.type === 'llm_call' && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
            <span>
              共 <span className="font-medium text-foreground">{total}</span> 条
            </span>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8"
                disabled={page <= 0}
                onClick={() => goPage(page - 1)}
              >
                上一页
              </Button>
              <span className="text-xs">
                {page + 1} / {pageCount}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8"
                disabled={page >= pageCount - 1}
                onClick={() => goPage(page + 1)}
              >
                下一页
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-md border border-border/80 bg-background/50">
            <table className="w-full min-w-[56rem] text-sm">
              <thead>
                <tr className="border-b border-border/80 text-left">
                  <th className="px-3 py-2 font-medium whitespace-nowrap">创建时间</th>
                  <th className="px-3 py-2 font-medium">source</th>
                  <th className="px-3 py-2 font-medium">source_id</th>
                  <th className="px-3 py-2 font-medium">provider</th>
                  <th className="px-3 py-2 font-medium">model</th>
                  <th className="px-3 py-2 font-medium whitespace-nowrap">耗时 ms</th>
                  <th className="px-3 py-2 font-medium">error</th>
                  <th className="px-3 py-2 font-medium">messages</th>
                  <th className="px-3 py-2 font-medium">output</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-3 py-6 text-center text-muted-foreground">
                      无记录（或未开启 LLM_DB_LOG）
                    </td>
                  </tr>
                ) : (
                  items.map((row) => (
                    <tr key={row.id} className="border-b border-border/60 last:border-0 align-top">
                      <td
                        className="px-3 py-2 font-mono text-xs whitespace-nowrap text-foreground"
                        title={row.createdAt}
                      >
                        {formatAdminLogTableTime(row.createdAt)}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-flex max-w-[14rem] truncate rounded-md border px-2 py-0.5 font-mono text-[11px] ${sourceTagClass(row.source)}`}
                          title={row.source}
                        >
                          {row.source}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-mono text-xs break-all max-w-[10rem]">
                        {row.sourceId ?? '—'}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-flex max-w-[10rem] truncate rounded-md border px-2 py-0.5 text-xs font-medium ${providerTagClass(row.provider)}`}
                          title={row.provider}
                        >
                          {row.provider}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-mono text-xs break-all max-w-[12rem]">
                        {row.model}
                      </td>
                      <td className="px-3 py-2 tabular-nums">{row.durationMs}</td>
                      <td className="px-3 py-2 text-xs text-destructive break-all max-w-[12rem]">
                        {row.error ?? '—'}
                      </td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          className="w-full max-w-[18rem] cursor-pointer rounded-md border border-transparent text-left transition-colors hover:border-border/80 hover:bg-muted/40"
                          onClick={() => openDetail(row.id, 'messages')}
                          title="点击查看完整 messages"
                        >
                          <p className="line-clamp-3 whitespace-pre-wrap break-words font-mono text-[11px] leading-snug text-foreground">
                            {row.lastMessageCell || '—'}
                          </p>
                        </button>
                      </td>
                      <td className="px-3 py-2">
                        {row.hasOutputJson ? (
                          <button
                            type="button"
                            className="w-full max-w-[18rem] cursor-pointer rounded-md border border-transparent text-left transition-colors hover:border-border/80 hover:bg-muted/40"
                            onClick={() => openDetail(row.id, 'output')}
                            title="点击查看完整 output_json"
                          >
                            {row.outputContentCell != null ? (
                              <p className="line-clamp-3 whitespace-pre-wrap break-words font-mono text-[11px] leading-snug text-foreground">
                                {row.outputContentCell}
                              </p>
                            ) : (
                              <span className="text-xs text-muted-foreground">（无 content 字段，点此看详情）</span>
                            )}
                          </button>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {detailPane != null && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeDetail()
          }}
        >
          <div
            className="flex max-h-[min(88vh,48rem)] w-full max-w-3xl flex-col rounded-lg border border-border bg-card shadow-lg"
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-log-detail-title"
          >
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3">
              <h2 id="admin-log-detail-title" className="text-sm font-semibold text-foreground">
                {detailPane === 'messages' ? '请求消息（messages）' : '模型输出（output_json）'}
              </h2>
              <Button type="button" variant="ghost" size="sm" className="h-8" onClick={closeDetail}>
                关闭
              </Button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
              {detailQ.isLoading && <p className="text-sm text-muted-foreground">加载详情…</p>}
              {detailQ.isError && (
                <p className="text-sm text-destructive">{(detailQ.error as Error).message}</p>
              )}
              {detailQ.isSuccess && detailPane === 'messages' && (
                <div className="space-y-6">
                  {messageRows.map((m, i) => (
                    <div key={i} className="border-b border-border/60 pb-4 last:border-0 last:pb-0">
                      <p className="mb-2 text-sm font-bold text-foreground">
                        第 {i + 1} 条消息 · 角色（role）：{' '}
                        <span className="font-mono font-bold">{m.role}</span>
                      </p>
                      {m.content.trim() ? (
                        <MarkdownViewer content={m.content} className="thinking-md" />
                      ) : (
                        <p className="text-xs text-muted-foreground">（空）</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {detailQ.isSuccess && detailPane === 'output' && (
                <div className="space-y-6">
                  <div className="border-b border-border/60 pb-4">
                    <p className="mb-1.5 text-sm font-bold text-foreground">模式（mode）</p>
                    <p className="font-mono text-sm text-foreground">{outputMode ?? '—'}</p>
                  </div>
                  {outputFields.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      除 mode 外无可展示字段（或仅有空对象）
                    </p>
                  ) : (
                    outputFields.map((f) => (
                      <div key={f.key} className="border-b border-border/60 pb-4 last:border-0 last:pb-0">
                        <p className="mb-2 text-sm font-bold text-foreground">
                          {outputFieldLabel(f.key)}（<span className="font-mono">{f.key}</span>）
                        </p>
                        <MarkdownViewer content={f.markdown} className="thinking-md" />
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
