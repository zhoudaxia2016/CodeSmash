import { useStickToBottomScroll } from '@/hooks/useStickToBottomScroll'
import { MarkdownViewer } from '@/components/markdown-viewer'
import { sanitizeCodingThoughtForDisplay } from '@/lib/stripCodeFences'
import { PHASE_CARD_INNER_SCROLL, PHASE_CARD_OUTER } from '../../lib/battlePhaseLayout'
import type { ModelSideHook } from '../../lib/battleTypes'

export function AnalysisCell({ battleId, hook }: { battleId: string; hook: ModelSideHook }) {
  const { displayResult, failedLlm, showAnalysis } = hook
  const thought = sanitizeCodingThoughtForDisplay(displayResult.thought ?? '')
  const analysisStreaming = displayResult.phase === 'analyzing'
  const analysisScroll = useStickToBottomScroll({
    resetKey: battleId,
    force: analysisStreaming,
    syncKey: `${analysisStreaming ? 1 : 0}:${showAnalysis ? 1 : 0}:${thought.length}:${thought}`,
  })

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      <div className={PHASE_CARD_OUTER}>
        <div
          ref={analysisScroll.ref}
          onScroll={analysisScroll.onScroll}
          className={PHASE_CARD_INNER_SCROLL}
        >
          {failedLlm && hook.result.error && (
            <p className="text-sm text-red-600 dark:text-red-400 px-3 pt-3">{hook.result.error}</p>
          )}
          {displayResult.phase === 'analyzing' && !String(thought).trim() && (
            <p className="text-sm text-muted-foreground px-3 py-3">正在生成分析…</p>
          )}
          {showAnalysis && String(thought).trim() && (
            <div className="border-l-[3px] border-l-primary/45 px-3 py-3 sm:pl-4">
              <MarkdownViewer content={thought} className="thinking-md" />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
