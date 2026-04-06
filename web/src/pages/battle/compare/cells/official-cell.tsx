import { useLayoutEffect, useRef, useState } from 'react'
import { buildVerifySnippet } from '@/lib/copyTestHarness'
import type { ModelRound, TestResult } from '@/types'
import { CopyVerifySnippetButton } from '../copy-verify-snippet-button'
import { CompactOfficialTiming } from '../timing'
import { officialMetrics } from '@/hooks/useBattleModelSide'
import {
  OFFICIAL_ACTUAL_OUTPUT_MAX_H,
  PHASE_CARD_INNER_SCROLL,
  PHASE_CARD_OUTER,
} from '../../lib/battlePhaseLayout'
import type { ModelSideHook } from '../../lib/battleTypes'

const OFFICIAL_RESULTS_TABLE_MIN_PX = 520

function OfficialResultTableBlock({
  displayResult,
  entryPoint,
  submitOfficialToServer,
}: {
  displayResult: ModelRound
  entryPoint: string
  submitOfficialToServer: boolean
}) {
  const resultsLayoutRef = useRef<HTMLDivElement>(null)
  const [useStackedResults, setUseStackedResults] = useState(false)
  const officialDetails = displayResult.officialResult?.details
  const hasOfficialDetails = Boolean(officialDetails && officialDetails.length > 0)
  const { passed, total } = officialMetrics(displayResult)

  useLayoutEffect(() => {
    if (!hasOfficialDetails) return
    const el = resultsLayoutRef.current
    if (!el) return
    const applyWidth = () => {
      const w = el.getBoundingClientRect().width
      if (w <= 0) return
      setUseStackedResults(w < OFFICIAL_RESULTS_TABLE_MIN_PX)
    }
    const ro = new ResizeObserver(applyWidth)
    ro.observe(el)
    applyWidth()
    const raf = requestAnimationFrame(applyWidth)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [hasOfficialDetails, officialDetails?.length])

  return (
    <div ref={resultsLayoutRef} className="min-w-0 space-y-2 px-1 pt-1">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span>
          <span className="text-muted-foreground">通过</span>
          <span className="ml-1.5 font-medium tabular-nums text-foreground">
            {passed}/{total}
          </span>
        </span>
        <CompactOfficialTiming r={displayResult} runningOfficial={false} />
      </div>
      {displayResult.officialResult &&
        displayResult.officialResult.total === 0 &&
        displayResult.phase === 'completed' && (
          <p className="text-xs text-muted-foreground">没有测试用例，未执行评测。</p>
        )}
      {displayResult.officialResult &&
        displayResult.officialResult.total > 0 &&
        (!displayResult.officialResult.details ||
          displayResult.officialResult.details.length === 0) &&
        displayResult.phase === 'completed' && (
          <p className="text-xs text-muted-foreground">
            {submitOfficialToServer
              ? '暂无逐条用例表。若刚完成对战，请稍候刷新或检查网络与服务。'
              : '暂无逐条用例表。'}
          </p>
        )}
      {officialDetails && officialDetails.length > 0 && (
        <>
          {!useStackedResults && (
            <div className="overflow-x-auto rounded-md bg-muted/15">
              <table className="w-full min-w-0 table-fixed text-left text-xs">
                <colgroup>
                  <col className="w-10" />
                  <col />
                  <col />
                  <col />
                  <col className="w-12" />
                  <col className="w-[5.5rem]" />
                </colgroup>
                <thead className="border-b border-border/70 bg-muted/40 font-medium text-muted-foreground">
                  <tr>
                    <th className="whitespace-nowrap px-2 py-1.5 align-middle">#</th>
                    <th className="whitespace-nowrap px-2 py-1.5 align-middle">输入</th>
                    <th className="whitespace-nowrap px-2 py-1.5 align-middle">期望</th>
                    <th className="whitespace-nowrap px-2 py-1.5 align-middle">实际</th>
                    <th className="whitespace-nowrap px-2 py-1.5 align-middle">结果</th>
                    <th className="whitespace-nowrap px-2 py-1.5 align-middle">验证</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {officialDetails.map((row: TestResult, idx: number) => {
                    const codeBody = (displayResult.code ?? '').trim()
                    return (
                      <tr key={row.testCaseId} className="bg-background/50">
                        <td className="px-2 py-1.5 font-mono text-muted-foreground">{idx + 1}</td>
                        <td className="break-all px-2 py-1.5 font-mono text-foreground">{row.input}</td>
                        <td className="break-all px-2 py-1.5 font-mono text-foreground">
                          {row.expectedOutput}
                        </td>
                        <td className="align-top px-2 py-1.5">
                          <div
                            className={`${OFFICIAL_ACTUAL_OUTPUT_MAX_H} overflow-y-auto break-all font-mono text-foreground whitespace-pre-wrap`}
                          >
                            {row.actualOutput}
                          </div>
                        </td>
                        <td className="px-2 py-1.5">
                          {row.passed ? (
                            <span className="text-emerald-600 dark:text-emerald-400">✓</span>
                          ) : (
                            <span className="text-red-600 dark:text-red-400">✗</span>
                          )}
                        </td>
                        <td className="px-2 py-1.5 align-middle">
                          <CopyVerifySnippetButton
                            text={buildVerifySnippet(
                              codeBody,
                              row.input,
                              entryPoint,
                              row.expectedOutput,
                            )}
                            disabled={!codeBody.trim()}
                            label="复制"
                          />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          {useStackedResults && (
            <ul className="space-y-2">
              {officialDetails.map((row: TestResult, idx: number) => {
                const codeBody = (displayResult.code ?? '').trim()
                return (
                  <li
                    key={row.testCaseId}
                    className="space-y-2 rounded-md border border-border/60 bg-muted/15 p-2 text-xs"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 pb-2">
                      <span className="font-mono text-muted-foreground">#{idx + 1}</span>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-muted-foreground">结果</span>
                        {row.passed ? (
                          <span className="text-emerald-600 dark:text-emerald-400">✓</span>
                        ) : (
                          <span className="text-red-600 dark:text-red-400">✗</span>
                        )}
                        <CopyVerifySnippetButton
                          text={buildVerifySnippet(
                            codeBody,
                            row.input,
                            entryPoint,
                            row.expectedOutput,
                          )}
                          disabled={!codeBody.trim()}
                          label="复制"
                        />
                      </div>
                    </div>
                    <div className="space-y-0.5">
                      <div className="text-[11px] font-medium text-muted-foreground">输入</div>
                      <div className="break-all font-mono text-foreground">{row.input}</div>
                    </div>
                    <div className="grid min-w-0 grid-cols-2 gap-x-2 gap-y-1 border-t border-border/40 pt-2">
                      <div className="min-w-0 space-y-0.5">
                        <div className="text-[11px] font-medium text-muted-foreground">期望</div>
                        <div className="break-words break-all font-mono text-foreground">
                          {row.expectedOutput}
                        </div>
                      </div>
                      <div className="min-w-0 space-y-0.5">
                        <div className="text-[11px] font-medium text-muted-foreground">实际</div>
                        <div
                          className={`${OFFICIAL_ACTUAL_OUTPUT_MAX_H} overflow-y-auto break-words break-all font-mono text-foreground whitespace-pre-wrap`}
                        >
                          {row.actualOutput}
                        </div>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </>
      )}
    </div>
  )
}

export function OfficialCell({
  hook,
  viewRound,
  isViewingLatest,
}: {
  hook: ModelSideHook
  viewRound: ModelRound | undefined
  isViewingLatest: boolean
}) {
  const {
    displayResult,
    failedLlm,
    localPhase,
    runProgress,
    officialError,
    runFailureDetail,
    showOfficialSection,
    runningOfficial,
    testCaseCount,
    testsReady,
    submitOfficialToServer,
    entryPoint,
  } = hook

  const modelTimingVisible =
    isViewingLatest &&
    !failedLlm &&
    (displayResult.phase === 'awaiting_execution' || displayResult.phase === 'completed') &&
    (displayResult.timeMs ?? 0) > 0

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

  if (!isViewingLatest) {
    const fr = viewRound.status === 'failed' || viewRound.phase === 'failed'
    return (
      <div className="flex h-full min-h-0 min-w-0 flex-col">
        <div className={PHASE_CARD_OUTER}>
          <div className={`${PHASE_CARD_INNER_SCROLL} space-y-2 p-3`}>
            <p className="text-xs text-muted-foreground">历史轮 · 只读</p>
            {fr && viewRound.error && (
              <p className="text-sm text-red-600 dark:text-red-400">{viewRound.error}</p>
            )}
            {fr && !viewRound.error && (
              <p className="text-sm text-muted-foreground">该轮模型生成失败。</p>
            )}
            {!fr && viewRound.phase === 'awaiting_execution' && !viewRound.officialResult && (
              <p className="text-sm text-muted-foreground">该轮尚未完成本机评测。</p>
            )}
            {!fr && viewRound.officialResult && (
              <OfficialResultTableBlock
                displayResult={viewRound}
                entryPoint={entryPoint}
                submitOfficialToServer={submitOfficialToServer}
              />
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      <div className={PHASE_CARD_OUTER}>
        <div className={`${PHASE_CARD_INNER_SCROLL} space-y-2 p-3`}>
          {modelTimingVisible && !showOfficialSection && (
            <div className="flex flex-wrap items-center gap-x-2 px-2 pt-1">
              <CompactOfficialTiming r={displayResult} runningOfficial={runningOfficial} />
            </div>
          )}
          {localPhase === 'idle' &&
            displayResult.phase === 'awaiting_execution' &&
            !failedLlm &&
            !testsReady && (
              <p className="px-2 text-sm text-muted-foreground">正在加载测试用例列表…</p>
            )}
          {localPhase === 'idle' &&
            displayResult.phase === 'awaiting_execution' &&
            !failedLlm &&
            testsReady &&
            testCaseCount > 0 && (
              <p className="px-2 text-sm text-muted-foreground">
                即将在本机依次运行 {testCaseCount} 条测试用例…
              </p>
            )}
          {localPhase === 'idle' &&
            displayResult.phase === 'awaiting_execution' &&
            !failedLlm &&
            testsReady &&
            testCaseCount === 0 && (
              <p className="px-2 text-sm text-amber-700 dark:text-amber-400">
                当前题目没有测试用例，无法评测。
              </p>
            )}
          {failedLlm && (
            <p className="px-2 text-sm text-muted-foreground">模型生成失败，跳过执行与测试评测。</p>
          )}
          {localPhase === 'running_tests' && runProgress && (
            <div className="space-y-2 px-2">
              <p className="text-sm text-foreground">正在执行测试用例…</p>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-arena-accent transition-[width] duration-200"
                  style={{
                    width: `${Math.round((100 * runProgress.done) / Math.max(runProgress.total, 1))}%`,
                  }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                进度 {runProgress.done} / {runProgress.total} 条
              </p>
            </div>
          )}
          {localPhase === 'error' && officialError === 'run' && (
            <div className="space-y-2 px-2 text-sm text-red-600 dark:text-red-400">
              <p>测试用例未能在本机跑完。请刷新页面；若仍失败，请重启本地开发服务后再试。</p>
              {runFailureDetail && (
                <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-all rounded-md border border-red-500/30 bg-red-500/5 p-2 text-xs text-red-700 dark:text-red-300">
                  {runFailureDetail}
                </pre>
              )}
            </div>
          )}
          {officialError === 'save' && submitOfficialToServer && (
            <p className="px-2 text-sm text-amber-800 dark:text-amber-200">
              本地测试已完成；写入对战服务失败（需网络与接口可用）。可刷新重试同步。
            </p>
          )}

          {showOfficialSection && (
            <OfficialResultTableBlock
              displayResult={displayResult}
              entryPoint={entryPoint}
              submitOfficialToServer={submitOfficialToServer}
            />
          )}
        </div>
      </div>
    </div>
  )
}
