import { useEffect, useState } from 'react'
import { useStickToBottomScroll } from '@/hooks/useStickToBottomScroll'
import { CodeBlock } from '@/components/code-block'
import { MarkdownViewer } from '@/components/markdown-viewer'
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
  const codePhaseScroll = useStickToBottomScroll({
    resetKey: battleId,
    force: codeStreaming,
    syncKey: `${thinkingOpen ? 1 : 0}:${thinking.length}:${codeForHighlight.length}:${raw}`,
  })

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      <div className={PHASE_CARD_OUTER}>
        <div
          ref={codePhaseScroll.ref}
          onScroll={codePhaseScroll.onScroll}
          className={PHASE_CARD_INNER_SCROLL}
        >
          {displayResult.phase === 'coding' && !hasThinkingUi && !hasCodeUi && (
            <p className="text-sm text-muted-foreground px-3 py-3">正在生成代码…</p>
          )}
          {showCode && (hasThinkingUi || hasCodeUi) && (
            <div className="space-y-4 p-3">
              {thinking ? (
                <details
                  className="group overflow-hidden"
                  open={thinkingOpen}
                  onToggle={(e) => setThinkingOpen(e.currentTarget.open)}
                >
                  <summary className="cursor-pointer select-none list-none rounded-md px-2 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted/20 [&::-webkit-details-marker]:hidden">
                    <span className="text-muted-foreground font-normal">可折叠 · </span>
                    思考
                  </summary>
                  <div className="mt-2 border-l-[3px] border-l-primary/45 py-1 pl-3 sm:pl-4">
                    <MarkdownViewer content={thinking} className="thinking-md" />
                  </div>
                </details>
              ) : null}
              {codeForHighlight ? (
                <div className={CODE_BLOCK_INNER}>
                  <CodeBlock
                    code={codeForHighlight}
                    className="m-0 overflow-x-auto whitespace-pre-wrap break-words font-mono text-sm leading-relaxed text-foreground"
                  />
                </div>
              ) : thinking ? (
                <p className="text-sm text-muted-foreground">暂无独立代码块（仅含思考过程时可展开上方查看）</p>
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
