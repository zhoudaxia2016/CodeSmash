import type { ReactNode } from 'react'
import { CopyVerifySnippetButton } from '@/components/CopyVerifySnippetButton'
import { JavaScriptCodeBlock } from '@/components/JavaScriptCodeBlock'
import { SolutionMarkdown } from '@/components/SolutionMarkdown'
import { buildVerifySnippet } from '@/lib/copyTestHarness'
import {
  prepareRunnableJavaScript,
  splitThinkingFromModelCode,
  stripCodeFences,
} from '@/lib/stripCodeFences'
import { activityLabel, useBattleModelSide } from '@/hooks/useBattleModelSide'
import type { ModelResult, TestCase, TestResult } from '@/types'

/** Fixed viewport-relative cap + scroll; avoid overscroll-contain so wheel chains to main when not overflowing */
const PHASE_SCROLL =
  'min-h-0 max-h-[min(42vh,22rem)] overflow-y-auto overflow-x-hidden'
const PHASE_SCROLL_OFFICIAL =
  'min-h-0 max-h-[min(48vh,28rem)] overflow-y-auto overflow-x-hidden'

/** 单列内的阶段标题（每侧模型各自一条，不跨列） */
function PhaseColumnHeading({ children }: { children: ReactNode }) {
  return (
    <h3 className="border-b border-border/60 pb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </h3>
  )
}

function LabeledMs({ label, ms, title }: { label: string; ms: number; title?: string }) {
  return (
    <span className="inline-flex items-baseline gap-0.5 whitespace-nowrap" title={title}>
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums font-medium text-foreground">{ms}ms</span>
    </span>
  )
}

/** 每项带中文标签，避免一串数字难辨 */
function CompactOfficialTiming({ r, runningOfficial }: { r: ModelResult; runningOfficial: boolean }) {
  const modelMs = r.timeMs ?? 0
  const a = r.analysisTimeMs
  const c = r.codingTimeMs
  const exec = r.officialResult?.timeMs
  const hasModel = modelMs > 0
  const hasOfficial = r.officialResult != null && !runningOfficial && exec != null

  if (!hasModel && !hasOfficial) return null

  const totalEnd = hasOfficial ? modelMs + exec! : null

  return (
    <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px]">
      {hasModel && (
        <>
          {a != null && c != null && (
            <>
              <LabeledMs label="分析" ms={a} title="分析阶段耗时" />
              <span className="text-border/70" aria-hidden>
                ·
              </span>
              <LabeledMs label="代码" ms={c} title="生成代码阶段耗时" />
              <span className="text-border/70" aria-hidden>
                ·
              </span>
            </>
          )}
          <LabeledMs label="模型" ms={modelMs} title="模型输出总耗时（分析+生成代码）" />
        </>
      )}
      {hasOfficial && (
        <>
          {hasModel && (
            <span className="text-border/70" aria-hidden>
              ·
            </span>
          )}
          <LabeledMs label="执行" ms={exec!} title="官方用例在本机执行耗时" />
          {totalEnd != null && (
            <>
              <span className="text-border/70" aria-hidden>
                ·
              </span>
              <span
                className="inline-flex items-baseline gap-0.5 whitespace-nowrap"
                title="总耗时 = 模型输出 + 执行"
              >
                <span className="text-muted-foreground">合计</span>
                <span className="tabular-nums font-semibold text-foreground">{totalEnd}ms</span>
              </span>
            </>
          )}
        </>
      )}
    </span>
  )
}

type ColProps = {
  label: string
  hook: ReturnType<typeof useBattleModelSide>
}

function ModelColumn({ label, hook }: ColProps) {
  return (
    <div className="flex min-h-0 min-w-0 flex-col gap-4">
      <ColumnHeader label={label} hook={hook} />
      <div className="flex min-h-0 flex-col gap-2">
        <PhaseColumnHeading>1 · 分析</PhaseColumnHeading>
        <AnalysisCell hook={hook} />
      </div>
      {hook.showCodePhase && (
        <div className="flex min-h-0 flex-col gap-2">
          <PhaseColumnHeading>2 · 代码</PhaseColumnHeading>
          <CodeCell hook={hook} />
        </div>
      )}
      {hook.showOfficialPhase && (
        <div className="flex min-h-0 flex-col gap-2">
          <PhaseColumnHeading>3 · 官方用例</PhaseColumnHeading>
          <OfficialCell hook={hook} />
        </div>
      )}
    </div>
  )
}

function ColumnHeader({ label, hook }: ColProps) {
  const { displayResult, ok, failedLlm } = hook
  return (
    <div className="flex flex-wrap items-center gap-2 min-h-[1.75rem]">
      <span className="font-semibold text-foreground">{label}</span>
      <span
        className={`rounded px-1.5 py-0.5 text-xs ${
          ok
            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400'
            : failedLlm
              ? 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400'
              : 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200'
        }`}
      >
        {failedLlm ? '失败' : ok ? '已完成' : activityLabel(displayResult)}
      </span>
    </div>
  )
}

function AnalysisCell({ hook }: { hook: ReturnType<typeof useBattleModelSide> }) {
  const { displayResult, failedLlm, showAnalysis } = hook
  return (
    <div
      className={`rounded-md border border-border/40 bg-background/80 p-1 ${PHASE_SCROLL}`}
    >
      {failedLlm && hook.result.error && (
        <p className="text-sm text-red-600 dark:text-red-400 px-2 pt-1">{hook.result.error}</p>
      )}
      {displayResult.phase === 'analyzing' && !String(displayResult.thought ?? '').trim() && (
        <p className="text-sm text-muted-foreground px-2 py-1">正在生成分析…</p>
      )}
      {showAnalysis && String(displayResult.thought ?? '').trim() && (
        <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2">
          {displayResult.phase === 'analyzing' ? (
            <pre className="whitespace-pre-wrap break-words font-sans text-sm text-foreground/90">
              {displayResult.thought}
            </pre>
          ) : (
            <SolutionMarkdown content={displayResult.thought ?? ''} />
          )}
        </div>
      )}
    </div>
  )
}

function CodeCell({ hook }: { hook: ReturnType<typeof useBattleModelSide> }) {
  const { displayResult, showCode } = hook
  const raw = displayResult.code ?? ''
  const { thinking, code: codeWithoutThinking } = splitThinkingFromModelCode(raw)
  const codeForHighlight = stripCodeFences(codeWithoutThinking)

  return (
    <div
      className={`rounded-md border border-border/40 bg-background/80 p-1 ${PHASE_SCROLL}`}
    >
      {displayResult.phase === 'coding' && !raw && (
        <p className="text-sm text-muted-foreground px-2 py-1">正在生成代码…</p>
      )}
      {showCode && raw && (
        <div className="space-y-3 px-1">
          {thinking ? (
            <details className="rounded-md border border-amber-500/25 bg-amber-500/[0.06] dark:border-amber-500/20 dark:bg-amber-500/[0.08]">
              <summary className="cursor-pointer select-none px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground">
                代码生成 · 思考过程（可折叠，与下方「代码」区分）
              </summary>
              <pre className="max-h-[min(30vh,14rem)] min-h-0 overflow-y-auto whitespace-pre-wrap break-words border-t border-border/50 px-3 py-2 font-sans text-[11px] leading-relaxed text-foreground/85">
                {thinking}
              </pre>
            </details>
          ) : null}
          {codeForHighlight ? (
            <div>
              <p className="mb-1.5 px-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                代码
              </p>
              <JavaScriptCodeBlock
                code={codeForHighlight}
                className="m-0 overflow-x-auto whitespace-pre-wrap break-words font-mono text-sm leading-relaxed text-foreground"
              />
            </div>
          ) : thinking ? (
            <p className="px-2 text-xs text-muted-foreground">暂无独立代码块（仅含思考过程时可展开上方查看）</p>
          ) : null}
        </div>
      )}
      {displayResult.selfTestConclusion && !displayResult.officialResult && (
        <p className="mt-2 px-2 text-xs text-muted-foreground">{displayResult.selfTestConclusion}</p>
      )}
    </div>
  )
}

function OfficialCell({ hook }: { hook: ReturnType<typeof useBattleModelSide> }) {
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
    <div
      className={`rounded-md border border-border/40 bg-background/80 p-1 space-y-2 ${PHASE_SCROLL_OFFICIAL}`}
    >
      {modelTimingVisible && !showOfficialSection && (
        <div className="flex flex-wrap items-center gap-x-2 px-2 pt-1">
          <CompactOfficialTiming r={displayResult} runningOfficial={runningOfficial} />
        </div>
      )}
      {localPhase === 'idle' &&
        displayResult.phase === 'awaiting_execution' &&
        !failedLlm &&
        !testsReady && (
          <p className="text-sm text-muted-foreground px-2">正在加载官方用例列表…</p>
        )}
      {localPhase === 'idle' &&
        displayResult.phase === 'awaiting_execution' &&
        !failedLlm &&
        testsReady &&
        enabledCaseCount > 0 && (
          <p className="text-sm text-muted-foreground px-2">
            即将在本机依次运行 {enabledCaseCount} 条官方用例…
          </p>
        )}
      {localPhase === 'idle' &&
        displayResult.phase === 'awaiting_execution' &&
        !failedLlm &&
        testsReady &&
        enabledCaseCount === 0 && (
          <p className="text-sm text-amber-700 dark:text-amber-400 px-2">
            当前题目没有启用的官方用例，无法评测。
          </p>
        )}
      {failedLlm && (
        <p className="text-sm text-muted-foreground px-2">模型生成失败，跳过执行与官方评测。</p>
      )}
      {localPhase === 'running_tests' && runProgress && (
        <div className="space-y-2 px-2">
          <p className="text-sm text-foreground">正在执行官方用例…</p>
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
          <p>官方用例未能在本机跑完。请刷新页面；若仍失败，请重启本地开发服务后再试。</p>
          {runFailureDetail && (
            <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-all rounded-md border border-red-500/30 bg-red-500/5 p-2 text-xs text-red-700 dark:text-red-300">
              {runFailureDetail}
            </pre>
          )}
        </div>
      )}
      {officialError === 'save' && submitOfficialToServer && (
        <p className="text-sm text-amber-800 dark:text-amber-200 px-2">
          本机评测已完成；写入对战服务失败（需网络与接口可用）。可刷新重试同步。
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
              <p className="text-xs text-muted-foreground">没有启用的官方用例，未执行评测。</p>
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
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full min-w-[20rem] text-left text-xs">
                <thead className="border-b border-border bg-muted/50 font-medium text-muted-foreground">
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
  )
}

type BattleCompareProps = {
  battleId: string
  modelAName: string
  modelBName: string
  resultA: ModelResult
  resultB: ModelResult
  testCases: TestCase[]
  testsReady: boolean
  submitOfficialToServer?: boolean
}

export function BattleCompare({
  battleId,
  modelAName,
  modelBName,
  resultA,
  resultB,
  testCases,
  testsReady,
  submitOfficialToServer = true,
}: BattleCompareProps) {
  const hookA = useBattleModelSide({
    battleId,
    side: 'modelA',
    result: resultA,
    testCases,
    testsReady,
    submitOfficialToServer,
  })
  const hookB = useBattleModelSide({
    battleId,
    side: 'modelB',
    result: resultB,
    testCases,
    testsReady,
    submitOfficialToServer,
  })

  return (
    <div className="grid min-h-0 grid-cols-1 gap-y-8 sm:grid-cols-2 sm:gap-x-8 sm:gap-y-0 items-start">
      <ModelColumn label={modelAName} hook={hookA} />
      <ModelColumn label={modelBName} hook={hookB} />
    </div>
  )
}
