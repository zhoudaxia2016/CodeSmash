import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Check, ChevronRight, Copy } from 'lucide-react'
import { useStickToBottomScroll } from '@/hooks/useStickToBottomScroll'
import { CodeBlock } from '@/components/code-block'
import { MarkdownViewer } from '@/components/markdown-viewer'
import { Button } from '@/components/ui/button'
import {
  CODE_BLOCK_INNER,
  PHASE_CARD_INNER_SCROLL,
  PHASE_CARD_OUTER,
} from '../../lib/battlePhaseLayout'
import { rawCodeStillHasThinkingXml } from '../../lib/modelCodeGuards'
import type { ModelSideHook } from '../../lib/battleTypes'
import {
  sanitizeCodingThoughtForDisplay,
  splitThinkingFromModelCode,
  stripCodeFences,
} from '@/lib/stripCodeFences'

function CopyModelCodeButton({ text }: { text: string }) {
  const [done, setDone] = useState(false)
  const handle = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setDone(true)
      window.setTimeout(() => setDone(false), 2000)
    } catch {
      setDone(false)
    }
  }
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="h-8 w-8 bg-background/90 text-muted-foreground shadow-sm ring-1 ring-border/50 backdrop-blur-sm hover:bg-accent hover:text-foreground"
      onClick={handle}
      title={done ? '已复制' : '复制代码'}
      aria-label={done ? '已复制' : '复制代码'}
    >
      {done ? (
        <Check className="h-4 w-4 text-emerald-600" aria-hidden />
      ) : (
        <Copy className="h-4 w-4" aria-hidden />
      )}
    </Button>
  )
}

export function CodeCell({ battleId, hook }: { battleId: string; hook: ModelSideHook }) {
  const { displayResult, showCode } = hook
  const raw = displayResult.code ?? ''
  const ct = (displayResult.codingThought ?? '').trim()
  /** Battle API splits thinking vs code on the server; client split only for legacy rows with merged XML. */
  const useServerFields = ct.length > 0 || !rawCodeStillHasThinkingXml(raw)
  const split = useServerFields
    ? { thinking: displayResult.codingThought ?? '', code: raw }
    : splitThinkingFromModelCode(raw)
  const thinking = sanitizeCodingThoughtForDisplay(split.thinking)
  const codeForHighlight = stripCodeFences(split.code)
  const hasThinkingUi = thinking.trim().length > 0
  const hasCodeUi = codeForHighlight.trim().length > 0

  const codeStreaming = displayResult.phase === 'coding'
  const [thinkingOpen, setThinkingOpen] = useState(() => codeStreaming)
  useEffect(() => {
    setThinkingOpen(displayResult.phase === 'coding')
  }, [battleId, displayResult.phase])

  const showThinkingUi = !!(thinking && showCode && (hasThinkingUi || hasCodeUi))
  /** 生成结束后顶栏折叠，避免长思考挤占代码区；流式中与代码同属主滚动区 */
  const dockThinking = showThinkingUi && !codeStreaming

  const codePhaseScroll = useStickToBottomScroll({
    resetKey: battleId,
    force: codeStreaming,
    syncKey: `${thinkingOpen ? 1 : 0}:${thinking.length}:${codeForHighlight.length}:${raw}`,
  })

  const thinkingDockRef = useRef<HTMLDivElement>(null)
  const [thinkingDockPx, setThinkingDockPx] = useState(0)

  useLayoutEffect(() => {
    if (!dockThinking) {
      setThinkingDockPx(0)
      return
    }
    const el = thinkingDockRef.current
    if (!el) return
    const apply = () => setThinkingDockPx(Math.ceil(el.getBoundingClientRect().height))
    apply()
    const ro = new ResizeObserver(apply)
    ro.observe(el)
    return () => ro.disconnect()
  }, [dockThinking, thinking, thinkingOpen, battleId])

  const thinkingPanelRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!thinkingOpen || !thinking.trim()) return
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target
      if (!(t instanceof Node)) return
      if (thinkingDockRef.current?.contains(t) || thinkingPanelRef.current?.contains(t)) return
      setThinkingOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [thinkingOpen, thinking])

  const thinkingScrollRef = useRef<HTMLDivElement>(null)
  const thinkingContentRef = useRef<HTMLDivElement>(null)
  const thinkingStick = useStickToBottomScroll({
    resetKey: battleId,
    force: true,
    syncKey: thinking,
    scrollRef: thinkingScrollRef,
    observeSizeRef: thinkingContentRef,
    enabled: dockThinking && thinkingOpen,
  })

  const thinkingSummary = (
    <summary className="flex cursor-pointer select-none list-none items-center gap-2 rounded-md px-2 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted/20 [&::-webkit-details-marker]:hidden">
      <ChevronRight
        className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-90"
        aria-hidden
      />
      思考
    </summary>
  )

  const thinkingAtTop =
    dockThinking && thinking ? (
      <div
        ref={thinkingDockRef}
        className="absolute inset-x-0 top-0 z-20 border-b border-border/60 bg-card px-3 py-2 shadow-[0_1px_0_hsl(var(--border)/0.5)]"
      >
        <details
          className="group overflow-hidden"
          open={thinkingOpen}
          onToggle={(e) => setThinkingOpen(e.currentTarget.open)}
        >
          {thinkingSummary}
          <div
            ref={thinkingScrollRef}
            onScroll={thinkingStick.onScroll}
            className="mt-2 max-h-[min(40vh,18rem)] overflow-y-auto border-l-[3px] border-l-primary/45 py-1 pl-3 sm:pl-4"
          >
            <div ref={thinkingContentRef} className="min-w-0">
              <MarkdownViewer content={thinking} className="thinking-md" />
            </div>
          </div>
        </details>
      </div>
    ) : null

  const showCopy =
    !!codeForHighlight && showCode && (hasThinkingUi || hasCodeUi)

  return (
    <div className="group relative flex h-full min-h-0 min-w-0 flex-col">
      {showCopy ? (
        <div
          className="pointer-events-none absolute right-2 z-30 opacity-0 transition-opacity duration-150 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100"
          style={{ top: thinkingDockPx + 8 }}
        >
          <CopyModelCodeButton text={codeForHighlight} />
        </div>
      ) : null}
      <div className={`relative ${PHASE_CARD_OUTER}`}>
        {thinkingAtTop}
        <div
          ref={codePhaseScroll.ref}
          onScroll={codePhaseScroll.onScroll}
          className={PHASE_CARD_INNER_SCROLL}
          style={thinkingDockPx > 0 ? { paddingTop: thinkingDockPx } : undefined}
        >
          {displayResult.phase === 'coding' && !hasThinkingUi && !hasCodeUi && (
            <p className="text-sm text-muted-foreground px-3 py-3">正在生成代码…</p>
          )}
          {showCode && (hasThinkingUi || hasCodeUi) && (
            <div className="space-y-4 p-3">
              {codeStreaming && thinking ? (
                <div ref={thinkingPanelRef}>
                  <details
                    className="group overflow-hidden"
                    open={thinkingOpen}
                    onToggle={(e) => setThinkingOpen(e.currentTarget.open)}
                  >
                    {thinkingSummary}
                    <div className="mt-2 border-l-[3px] border-l-primary/45 py-1 pl-3 sm:pl-4">
                      <MarkdownViewer content={thinking} className="thinking-md" />
                    </div>
                  </details>
                </div>
              ) : null}
              {codeForHighlight ? (
                <div className={CODE_BLOCK_INNER}>
                  <CodeBlock
                    code={codeForHighlight}
                    className="m-0 overflow-x-auto whitespace-pre-wrap break-words font-mono text-sm leading-relaxed text-foreground"
                  />
                </div>
              ) : thinking ? (
                <p className="text-sm text-muted-foreground">
                  暂无独立代码块（请展开「思考」查看过程）
                </p>
              ) : null}
            </div>
          )}
          {displayResult.selfTestConclusion && !displayResult.officialResult && (
            <p className="mt-1 px-3 pb-3 text-xs text-muted-foreground">{displayResult.selfTestConclusion}</p>
          )}
        </div>
      </div>
    </div>
  )
}
