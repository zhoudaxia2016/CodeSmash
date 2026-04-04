import { CopyVerifySnippetButton } from '../copy-verify-snippet-button'
import { CompactOfficialTiming } from '../timing'
import { PHASE_CARD_INNER_SCROLL, PHASE_CARD_OUTER } from '../../lib/battlePhaseLayout'
import type { ModelSideHook } from '../../lib/battleTypes'
import { buildVerifySnippet } from '@/lib/copyTestHarness'
import { prepareRunnableJavaScript } from '@/lib/stripCodeFences'
import type { TestResult } from '@/types'

export function OfficialCell({ hook }: { hook: ModelSideHook }) {
  const {
    displayResult,
    failedLlm,
    localPhase,
    runProgress,
    officialError,
    runFailureDetail,
    showOfficialSection,
    passed,
    total,
    runningOfficial,
    enabledCaseCount,
    testsReady,
    submitOfficialToServer,
  } = hook

  const modelTimingVisible =
    !failedLlm &&
    (displayResult.phase === 'awaiting_execution' || displayResult.phase === 'completed') &&
    (displayResult.timeMs ?? 0) > 0

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
              <p className="text-sm text-muted-foreground px-2">正在加载测试用例列表…</p>
            )}
          {localPhase === 'idle' &&
            displayResult.phase === 'awaiting_execution' &&
            !failedLlm &&
            testsReady &&
            enabledCaseCount > 0 && (
              <p className="text-sm text-muted-foreground px-2">
                即将在本机依次运行 {enabledCaseCount} 条测试用例…
              </p>
            )}
          {localPhase === 'idle' &&
            displayResult.phase === 'awaiting_execution' &&
            !failedLlm &&
            testsReady &&
            enabledCaseCount === 0 && (
              <p className="text-sm text-amber-700 dark:text-amber-400 px-2">
                当前题目没有启用的测试用例，无法评测。
              </p>
            )}
          {failedLlm && (
            <p className="text-sm text-muted-foreground px-2">模型生成失败，跳过执行与测试评测。</p>
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
            <p className="text-sm text-amber-800 dark:text-amber-200 px-2">
              本地测试已完成；写入对战服务失败（需网络与接口可用）。可刷新重试同步。
            </p>
          )}

          {showOfficialSection && (
            <div className="space-y-2 px-1 pt-1">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <span>
                  <span className="text-muted-foreground">通过</span>
                  <span className="ml-1.5 font-medium tabular-nums text-foreground">
                    {passed}/{total}
                  </span>
                </span>
                <CompactOfficialTiming r={displayResult} runningOfficial={runningOfficial} />
              </div>
              {displayResult.officialResult &&
                displayResult.officialResult.total === 0 &&
                displayResult.phase === 'completed' && (
                  <p className="text-xs text-muted-foreground">没有启用的测试用例，未执行评测。</p>
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
              {displayResult.officialResult?.details && displayResult.officialResult.details.length > 0 && (
                <div className="overflow-x-auto rounded-md bg-muted/15">
                  <table className="w-full min-w-[20rem] text-left text-xs">
                    <thead className="border-b border-border/70 bg-muted/40 font-medium text-muted-foreground">
                      <tr>
                        <th className="px-2 py-1.5 w-10">#</th>
                        <th className="px-2 py-1.5">输入</th>
                        <th className="px-2 py-1.5">期望</th>
                        <th className="px-2 py-1.5">实际</th>
                        <th className="px-2 py-1.5 w-12">结果</th>
                        <th className="px-2 py-1.5 w-[5rem] shrink-0">验证</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {displayResult.officialResult.details.map((row: TestResult, idx: number) => {
                        const codeBody = prepareRunnableJavaScript(displayResult.code ?? '')
                        return (
                          <tr key={row.testCaseId} className="bg-background/50">
                            <td className="px-2 py-1.5 font-mono text-muted-foreground">{idx + 1}</td>
                            <td className="px-2 py-1.5 font-mono text-foreground">{row.input}</td>
                            <td className="px-2 py-1.5 font-mono text-foreground">{row.expectedOutput}</td>
                            <td className="px-2 py-1.5 font-mono text-foreground">{row.actualOutput}</td>
                            <td className="px-2 py-1.5">
                              {row.passed ? (
                                <span className="text-emerald-600 dark:text-emerald-400">✓</span>
                              ) : (
                                <span className="text-red-600 dark:text-red-400">✗</span>
                              )}
                            </td>
                            <td className="px-2 py-1.5 align-middle">
                              <CopyVerifySnippetButton
                                text={buildVerifySnippet(codeBody, row.input, row.expectedOutput)}
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
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
