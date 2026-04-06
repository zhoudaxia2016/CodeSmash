import { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'

export type RefineMenuBridge = {
  submit: (payload: { userMessage: string; includeFailedCases: boolean }) => void
  isPending: boolean
  isError: boolean
  error: Error | null
}

type ModelRoundBarProps = {
  tabCount: number
  /** 与 tab 一一对应；有官方评测结果时多为 `xx%`，待测为「待测」，失败等为「—」。 */
  tabPassLabels?: (string | null)[]
  selectedIndex: number
  onSelect: (index: number) => void
  refine: {
    bridge: RefineMenuBridge
    disabled: boolean
    disabledTitle?: string
    showError: boolean
  } | null
}

function RefineMenu({
  bridge,
  showError,
  disabled,
  disabledTitle,
}: {
  bridge: RefineMenuBridge
  showError: boolean
  disabled: boolean
  disabledTitle?: string
}) {
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [includeFailedCases, setIncludeFailedCases] = useState(true)
  const submittedRef = useRef(false)

  const busy = bridge.isPending
  const block = busy || disabled
  const buttonTitle = busy ? '追问请求处理中…' : disabled ? disabledTitle : undefined

  useEffect(() => {
    if (disabled) setOpen(false)
  }, [disabled])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  useEffect(() => {
    if (!submittedRef.current || bridge.isPending) return
    submittedRef.current = false
    if (!bridge.isError) setOpen(false)
  }, [bridge.isPending, bridge.isError])

  return (
    <div className="relative shrink-0">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 gap-1 px-2.5 text-xs font-medium"
        disabled={block}
        title={buttonTitle}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => {
          if (block) return
          setOpen((v) => !v)
        }}
      >
        追问
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </Button>
      {open && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 cursor-default bg-transparent"
            aria-label="关闭追问面板"
            onClick={() => setOpen(false)}
          />
          <div
            role="dialog"
            aria-label="追问优化"
            className="absolute right-0 top-full z-50 mt-1 w-[min(20rem,calc(100vw-2rem))] space-y-2 rounded-lg border border-border bg-popover p-3 text-popover-foreground shadow-lg"
          >
            <p className="text-xs text-muted-foreground">
              基于本题与此前各轮对话记录重新分析并生成代码；新内容出现在本列「最新」轮。
            </p>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="可选：希望如何改进（留空则主要依据评测反馈）"
              rows={3}
              disabled={busy}
              className="w-full resize-y rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
            />
            <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={includeFailedCases}
                onChange={(e) => setIncludeFailedCases(e.target.checked)}
                disabled={busy}
                className="rounded border-input"
              />
              附带未通过用例的输入 / 期望 / 实际
            </label>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => setOpen(false)}>
                取消
              </Button>
              <Button
                type="button"
                size="sm"
                className="font-semibold"
                disabled={busy}
                onClick={() => {
                  submittedRef.current = true
                  bridge.submit({ userMessage: message, includeFailedCases })
                }}
              >
                {busy ? '请求中…' : '发起追问'}
              </Button>
            </div>
            {showError && bridge.isError && (
              <p className="text-xs text-destructive" role="alert">
                {bridge.error instanceof Error ? bridge.error.message : '追问失败'}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  )
}

/** 轮次 tab + 追问；sticky 由外层与模型名一起包住（见 Compare）。 */
export function ModelRoundBar({
  tabCount,
  tabPassLabels,
  selectedIndex,
  onSelect,
  refine,
}: ModelRoundBarProps) {
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1" role="tablist" aria-label="模型轮次">
            {Array.from({ length: tabCount }, (_, i) => {
              const selected = i === selectedIndex
              const pass = tabPassLabels?.[i] ?? null
              return (
                <button
                  key={i}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => onSelect(i)}
                  className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                    selected
                      ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                      : 'border-border/80 bg-muted/40 text-muted-foreground hover:bg-muted/70 hover:text-foreground'
                  }`}
                >
                  第 {i + 1} 轮
                  {pass ? ` · ${pass}` : ''}
                </button>
              )
            })}
          </div>
        </div>
        {refine ? (
          <RefineMenu
            bridge={refine.bridge}
            showError={refine.showError}
            disabled={refine.disabled}
            disabledTitle={refine.disabledTitle}
          />
        ) : null}
      </div>
    </div>
  )
}
