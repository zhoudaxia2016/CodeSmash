import { useRef } from 'react'
import { useStickToBottomScroll } from '@/hooks/useStickToBottomScroll'
import { MarkdownViewer } from '@/components/markdown-viewer'
import { sanitizeCodingThoughtForDisplay } from '@/lib/stripCodeFences'
import type { ModelRound } from '@/types'
import { PHASE_CARD_INNER_SCROLL, PHASE_CARD_OUTER } from '../../lib/battlePhaseLayout'
export function AnalysisCell({
  battleId,
  viewRound,
  isViewingLatest,
}: {
  battleId: string
  viewRound: ModelRound | undefined
  isViewingLatest: boolean
}) {
  const failedLlm =
    viewRound != null && (viewRound.status === 'failed' || viewRound.phase === 'failed')
  const thought = sanitizeCodingThoughtForDisplay(viewRound?.thought ?? '')
  const analysisStreaming = Boolean(isViewingLatest && viewRound?.phase === 'analyzing')
  const showAnalysis =
    viewRound &&
    (viewRound.phase === 'analyzing' ||
      viewRound.phase === 'coding' ||
      viewRound.phase === 'awaiting_execution' ||
      viewRound.phase === 'completed' ||
      (viewRound.thought && viewRound.thought.length > 0))

  const analysisContentRef = useRef<HTMLDivElement>(null)
  const analysisScroll = useStickToBottomScroll({
    resetKey: battleId,
    force: analysisStreaming,
    syncKey: `${analysisStreaming ? 1 : 0}:${showAnalysis ? 1 : 0}:${thought.length}:${thought}`,
    observeSizeRef: analysisContentRef,
  })

  if (viewRound === undefined) {
    return (
      <div className="flex h-full min-h-0 min-w-0 flex-col">
        <div className={PHASE_CARD_OUTER}>
          <div className={`${PHASE_CARD_INNER_SCROLL} p-3 text-sm text-muted-foreground`}>
            该模型尚无这一轮输出。
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      <div className={PHASE_CARD_OUTER}>
        <div
          ref={analysisScroll.ref}
          onScroll={analysisScroll.onScroll}
          className={PHASE_CARD_INNER_SCROLL}
        >
          {failedLlm && viewRound.error && (
            <p className="px-3 pt-3 text-sm text-red-600 dark:text-red-400">{viewRound.error}</p>
          )}
          {viewRound.phase === 'analyzing' && !String(thought).trim() && (
            <p className="px-3 py-3 text-sm text-muted-foreground">正在生成分析…</p>
          )}
          {showAnalysis && String(thought).trim() && (
            <div className="border-l-[3px] border-l-primary/45 px-3 py-3 sm:pl-4">
              <div ref={analysisContentRef} className="min-w-0">
                <MarkdownViewer content={thought} className="thinking-md" />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
