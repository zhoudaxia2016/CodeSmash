import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronRight, Copy, GitCompare } from 'lucide-react'
import { useStickToBottomScroll } from '../hooks/use-stick-to-bottom-scroll'
import { CodeHighlight } from '@/components/code-highlight'
import { MarkdownViewer } from '@/components/markdown-viewer'
import { Button } from '@/components/ui/button'
import {
  CODE_BLOCK_INNER,
  PHASE_CARD_INNER_SCROLL,
  PHASE_CARD_OUTER,
} from '../../lib/battlePhaseLayout'
import { rawCodeStillHasThinkingXml } from '../../lib/modelCodeGuards'
import type { ModelRound } from '@/types'
import {
  sanitizeCodingThoughtForDisplay,
  splitThinkingFromModelCode,
  stripCodeFences,
} from '../lib/strip-code-fences'
import { diffLines, diffWordsWithSpace } from 'diff'
import {
  highlightJavaScriptLinesToHtml,
  highlightJavaScriptRegexHtml,
} from '@/components/code-highlight/lib/tree-sitter-javascript'

/** Runnable-looking code for diff/copy（与下列 CodeCell 内提取逻辑一致）。 */
export function comparableCodeFromRound(r: ModelRound | undefined): string {
  if (!r) return ''
  const raw = r.code ?? ''
  const ct = (r.codingThought ?? '').trim()
  const useServerFields = ct.length > 0 || !rawCodeStillHasThinkingXml(raw)
  const split = useServerFields
    ? { thinking: r.codingThought ?? '', code: raw }
    : splitThinkingFromModelCode(raw)
  return stripCodeFences(split.code).trim()
}

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

function splitDiffPartLines(raw: string): string[] {
  return raw.endsWith('\n') ? raw.slice(0, -1).split('\n') : raw.split('\n')
}

function diffRowBackgroundClass(part: { added?: boolean; removed?: boolean }): string {
  if (part.added) return 'bg-emerald-500/15 text-foreground'
  if (part.removed) return 'bg-red-500/15 text-foreground'
  return 'text-muted-foreground'
}

/** Inline styles so Tailwind purge cannot strip diff markup inside innerHTML. */
const INLINE_DIFF_REMOVED =
  'background-color:hsl(0 72% 45% / 0.32);border-radius:2px;padding:0 2px;margin:0 -1px'
const INLINE_DIFF_ADDED =
  'background-color:hsl(152 55% 36% / 0.32);border-radius:2px;padding:0 2px;margin:0 -1px'

function inlineDiffMinusHtml(oldLine: string, newLine: string): string {
  const chunks = diffWordsWithSpace(oldLine, newLine)
  let out = ''
  for (const p of chunks) {
    if (p.added) continue
    const body = highlightJavaScriptRegexHtml(p.value)
    if (p.removed) {
      out += `<span style="${INLINE_DIFF_REMOVED}">${body}</span>`
    } else {
      out += body
    }
  }
  return out.length > 0 ? out : '&#160;'
}

function inlineDiffPlusHtml(oldLine: string, newLine: string): string {
  const chunks = diffWordsWithSpace(oldLine, newLine)
  let out = ''
  for (const p of chunks) {
    if (p.removed) continue
    const body = highlightJavaScriptRegexHtml(p.value)
    if (p.added) {
      out += `<span style="${INLINE_DIFF_ADDED}">${body}</span>`
    } else {
      out += body
    }
  }
  return out.length > 0 ? out : '&#160;'
}

type DiffViewRow = {
  key: string
  mark: string
  lineCls: string
  highlighted: boolean
  innerHtml?: string
  plainText?: string
}

function buildDiffViewRows(
  before: string,
  after: string,
  beforeLineHtml: string[] | null,
  afterLineHtml: string[] | null,
): DiffViewRow[] {
  const parts = diffLines(before, after)
  let bi = 0
  let ai = 0
  const rows: DiffViewRow[] = []

  const pushOnePart = (part: (typeof parts)[number], pi: number) => {
    const lines = splitDiffPartLines(part.value)
    const mark = part.added ? '+' : part.removed ? '-' : ' '
    const lineCls = diffRowBackgroundClass(part)
    const useHtml = beforeLineHtml !== null && afterLineHtml !== null

    lines.forEach((line, li) => {
      const key = `${pi}-${li}-${mark}-${bi}-${ai}`

      if (part.removed) {
        const idx = bi++
        const inner =
          useHtml && beforeLineHtml![idx] !== undefined
            ? beforeLineHtml![idx]!
            : highlightJavaScriptRegexHtml(line)
        rows.push({
          key,
          mark,
          lineCls,
          highlighted: useHtml,
          innerHtml: inner || '&#160;',
          plainText: line,
        })
        return
      }

      if (part.added) {
        const idx = ai++
        const inner =
          useHtml && afterLineHtml![idx] !== undefined
            ? afterLineHtml![idx]!
            : highlightJavaScriptRegexHtml(line)
        rows.push({
          key,
          mark,
          lineCls,
          highlighted: useHtml,
          innerHtml: inner || '&#160;',
          plainText: line,
        })
        return
      }

      const idx = ai++
      bi++
      const inner =
        useHtml && afterLineHtml![idx] !== undefined
          ? afterLineHtml![idx]!
          : highlightJavaScriptRegexHtml(line)
      rows.push({
        key,
        mark,
        lineCls,
        highlighted: useHtml,
        innerHtml: inner || '&#160;',
        plainText: line,
      })
    })
  }

  let pi = 0
  while (pi < parts.length) {
    const part = parts[pi]!
    const next = parts[pi + 1]

    if (part.removed && next?.added) {
      const rLines = splitDiffPartLines(part.value)
      const aLines = splitDiffPartLines(next.value)
      if (rLines.length === aLines.length) {
        for (let j = 0; j < rLines.length; j++) {
          const oldL = rLines[j]!
          const newL = aLines[j]!
          rows.push({
            key: `inl-${pi}-${j}-m-${bi}-${ai}`,
            mark: '-',
            lineCls: 'bg-red-500/15 text-foreground',
            highlighted: true,
            innerHtml: inlineDiffMinusHtml(oldL, newL),
            plainText: oldL,
          })
          bi++
          rows.push({
            key: `inl-${pi}-${j}-p-${bi}-${ai}`,
            mark: '+',
            lineCls: 'bg-emerald-500/15 text-foreground',
            highlighted: true,
            innerHtml: inlineDiffPlusHtml(oldL, newL),
            plainText: newL,
          })
          ai++
        }
        pi += 2
        continue
      }
    }

    pushOnePart(part, pi)
    pi++
  }

  return rows
}

function CodeLineDiffPanel({ before, after }: { before: string; after: string }) {
  const [rows, setRows] = useState<DiffViewRow[] | null>(null)
  const plainFallbackRows = useMemo(
    () => buildDiffViewRows(before, after, null, null),
    [before, after],
  )

  useEffect(() => {
    let alive = true
    setRows(null)
    void Promise.all([highlightJavaScriptLinesToHtml(before), highlightJavaScriptLinesToHtml(after)])
      .then(([bh, ah]) => {
        if (!alive) return
        setRows(buildDiffViewRows(before, after, bh, ah))
      })
      .catch(() => {
        if (!alive) return
        setRows(null)
      })
    return () => {
      alive = false
    }
  }, [before, after])

  const displayRows = rows ?? plainFallbackRows

  return (
    <div className={`${CODE_BLOCK_INNER} max-h-[min(50vh,24rem)] overflow-auto rounded-md bg-muted/20 p-2`}>
      <pre className="m-0 whitespace-pre-wrap break-words font-mono text-xs leading-relaxed">
        {displayRows.map((row) => (
          <div key={row.key} className={`px-1 ${row.lineCls}`}>
            <span className="select-none tabular-nums text-muted-foreground/80">{row.mark} </span>
            {row.highlighted ? (
              <code
                className="code-highlight-root inline min-w-0 whitespace-pre-wrap break-words font-mono text-[inherit] leading-relaxed text-foreground"
                dangerouslySetInnerHTML={{ __html: row.innerHtml ?? '&#160;' }}
              />
            ) : (
              <code className="inline min-w-0 whitespace-pre-wrap break-words font-mono text-[inherit] leading-relaxed">
                {row.plainText || '\u00a0'}
              </code>
            )}
          </div>
        ))}
      </pre>
    </div>
  )
}

function DiffToggleButton({
  active,
  onClick,
}: {
  active: boolean
  onClick: () => void
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={`h-8 w-8 bg-background/90 shadow-sm ring-1 ring-border/50 backdrop-blur-sm hover:bg-accent hover:text-foreground ${
        active ? 'text-primary ring-primary/40' : 'text-muted-foreground'
      }`}
      onClick={onClick}
      title={active ? '关闭对比' : '与上一轮 diff'}
      aria-label={active ? '关闭对比' : '与上一轮 diff'}
      aria-pressed={active}
    >
      <GitCompare className="h-4 w-4" aria-hidden />
    </Button>
  )
}

export function CodeCell({
  battleId,
  viewRound,
  isViewingLatest,
  previousComparableCode,
}: {
  battleId: string
  viewRound: ModelRound | undefined
  isViewingLatest: boolean
  /** 上一轮可比对代码；无则不出 diff 按钮（首轮）。 */
  previousComparableCode?: string
}) {
  if (viewRound === undefined) {
    return (
      <div className="group relative flex h-full min-h-0 min-w-0 flex-col">
        <div className={PHASE_CARD_OUTER}>
          <div className={`${PHASE_CARD_INNER_SCROLL} p-3 text-sm text-muted-foreground`}>
            该模型尚无这一轮输出。
          </div>
        </div>
      </div>
    )
  }

  const displayResult = viewRound
  const raw = displayResult.code ?? ''
  const ct = (displayResult.codingThought ?? '').trim()
  const useServerFields = ct.length > 0 || !rawCodeStillHasThinkingXml(raw)
  const split = useServerFields
    ? { thinking: displayResult.codingThought ?? '', code: raw }
    : splitThinkingFromModelCode(raw)
  const thinking = sanitizeCodingThoughtForDisplay(split.thinking)
  const codeForHighlight = comparableCodeFromRound(displayResult)
  const hasThinkingUi = thinking.trim().length > 0
  const hasCodeUi = codeForHighlight.trim().length > 0

  const codeStreaming = Boolean(isViewingLatest && displayResult.phase === 'coding')
  const [thinkingOpen, setThinkingOpen] = useState(() => codeStreaming)
  useEffect(() => {
    setThinkingOpen(isViewingLatest && displayResult.phase === 'coding')
  }, [battleId, displayResult.phase, isViewingLatest])

  const showCode =
    displayResult.phase === 'coding' ||
    displayResult.phase === 'awaiting_execution' ||
    displayResult.phase === 'completed' ||
    (displayResult.code && displayResult.code.length > 0)

  const showThinkingUi = !!(thinking && showCode && (hasThinkingUi || hasCodeUi))
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

  const showCopy = !!codeForHighlight && showCode && (hasThinkingUi || hasCodeUi)
  const canDiff =
    Boolean(previousComparableCode) && !!codeForHighlight.trim() && showCode && (hasThinkingUi || hasCodeUi)
  const [diffOpen, setDiffOpen] = useState(false)

  useEffect(() => {
    setDiffOpen(false)
  }, [battleId, codeForHighlight, previousComparableCode])

  return (
    <div className="group relative flex h-full min-h-0 min-w-0 flex-col">
      {showCopy ? (
        <div
          className="pointer-events-none absolute right-2 z-30 flex gap-1 opacity-0 transition-opacity duration-150 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100"
          style={{ top: thinkingDockPx + 8 }}
        >
          {canDiff ? <DiffToggleButton active={diffOpen} onClick={() => setDiffOpen((v) => !v)} /> : null}
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
            <p className="px-3 py-3 text-sm text-muted-foreground">正在生成代码…</p>
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
                diffOpen && canDiff && previousComparableCode !== undefined ? (
                  <CodeLineDiffPanel before={previousComparableCode} after={codeForHighlight} />
                ) : (
                  <div className={CODE_BLOCK_INNER}>
                    <CodeHighlight
                      code={codeForHighlight}
                      language="javascript"
                      className="m-0 overflow-x-auto whitespace-pre-wrap break-words font-mono text-sm leading-relaxed text-foreground"
                    />
                  </div>
                )
              ) : thinking ? (
                <p className="text-sm text-muted-foreground">
                  暂无独立代码块（请展开「思考」查看过程）
                </p>
              ) : null}
            </div>
          )}
          {displayResult.selfTestConclusion && !displayResult.officialResult && (
            <p className="mt-1 px-3 pb-3 text-xs text-muted-foreground">
              {displayResult.selfTestConclusion}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
