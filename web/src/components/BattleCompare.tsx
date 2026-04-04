import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { useStickToBottomScroll } from '@/hooks/useStickToBottomScroll'
import { CopyVerifySnippetButton } from '@/components/CopyVerifySnippetButton'
import { JavaScriptCodeBlock } from '@/components/JavaScriptCodeBlock'
import { SolutionMarkdown } from '@/components/SolutionMarkdown'
import { buildVerifySnippet } from '@/lib/copyTestHarness'
import {
  prepareRunnableJavaScript,
  sanitizeCodingThoughtForDisplay,
  splitThinkingFromModelCode,
  stripCodeFences,
} from '@/lib/stripCodeFences'
import { activityLabel, useBattleModelSide } from '@/hooks/useBattleModelSide'
import { formatDurationSeconds } from '@/lib/formatDuration'
import type { ModelResult, TestCase, TestResult } from '@/types'

function rawCodeStillHasThinkingXml(raw: string): boolean {
  return (
    /<redacted_thinking/i.test(raw) ||
    /<\/redacted_thinking>/i.test(raw) ||
    /<thinking>/i.test(raw) ||
    /<\/thinking>/i.test(raw)
  )
}

/**
 * 分析 / 代码 / 官方用例：同一 max-height（原分析高度的 2 倍）+ 单滚动条，双列对齐。
 */
const PHASE_CARD_SCROLL =
  'min-h-0 max-h-[min(84vh,44rem)] overflow-y-auto overflow-x-hidden'

/** 代码块内层：不再加 border（外层卡片已有一圈），仅底色与横向滚动 */
const CODE_BLOCK_INNER = 'rounded-md bg-muted/20 p-3 overflow-x-auto'

const MAIN_STICK_NEAR_PX = 80

/** 单列内的阶段标题（每侧模型各自一条，不跨列） */
function PhaseColumnHeading({ children }: { children: ReactNode }) {
  return (
    <h3 className="border-b border-border/60 pb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </h3>
  )
}

function LabeledDuration({
  label,
  ms,
  title,
}: {
  label: string
  ms: number
  title?: string
}) {
  const exact = `${ms} ms`
  const tip = title ? `${title}（${exact}）` : exact
  return (
    <span className="inline-flex items-baseline gap-0.5 whitespace-nowrap" title={tip}>
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums font-medium text-foreground">{formatDurationSeconds(ms)}</span>
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
              <LabeledDuration label="分析" ms={a} title="分析阶段耗时" />
              <span className="text-border/70" aria-hidden>
                ·
              </span>
              <LabeledDuration label="代码" ms={c} title="生成代码阶段耗时" />
              <span className="text-border/70" aria-hidden>
                ·
              </span>
            </>
          )}
          <LabeledDuration label="模型" ms={modelMs} title="模型输出总耗时（分析+生成代码）" />
        </>
      )}
      {hasOfficial && (
        <>
          {hasModel && (
            <span className="text-border/70" aria-hidden>
              ·
            </span>
          )}
          <LabeledDuration label="执行" ms={exec!} title="官方用例在本机执行耗时" />
          {totalEnd != null && (
            <>
              <span className="text-border/70" aria-hidden>
                ·
              </span>
              <span
                className="inline-flex items-baseline gap-0.5 whitespace-nowrap"
                title={`总耗时 = 模型输出 + 执行（${totalEnd} ms）`}
              >
                <span className="text-muted-foreground">合计</span>
                <span className="tabular-nums font-semibold text-foreground">
                  {formatDurationSeconds(totalEnd)}
                </span>
              </span>
            </>
          )}
        </>
      )}
    </span>
  )
}

type ModelSideHook = ReturnType<typeof useBattleModelSide>

type ColumnHeaderProps = { label: string; hook: ModelSideHook }

type ModelColumnProps = ColumnHeaderProps & { battleId: string }

function ModelColumn({ battleId, label, hook }: ModelColumnProps) {
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col gap-4">
      <ColumnHeader label={label} hook={hook} />
      <div className="flex min-h-0 flex-col gap-2">
        <PhaseColumnHeading>1 · 分析</PhaseColumnHeading>
        <AnalysisCell battleId={battleId} hook={hook} />
      </div>
      {hook.showCodePhase && (
        <div className="flex min-h-0 flex-col gap-2">
          <PhaseColumnHeading>2 · 代码</PhaseColumnHeading>
          <CodeCell battleId={battleId} hook={hook} />
        </div>
      )}
      {hook.showOfficialPhase && (
        <div className="flex min-h-0 flex-col gap-2">
          <PhaseColumnHeading>3 · 执行测试</PhaseColumnHeading>
          <OfficialCell hook={hook} />
        </div>
      )}
    </div>
  )
}

function ColumnHeader({ label, hook }: ColumnHeaderProps) {
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

function AnalysisCell({ battleId, hook }: { battleId: string; hook: ModelSideHook }) {
  const { displayResult, failedLlm, showAnalysis } = hook
  const thought = sanitizeCodingThoughtForDisplay(displayResult.thought ?? '')
  const analysisStreaming = displayResult.phase === 'analyzing'
  const analysisScroll = useStickToBottomScroll({
    resetKey: battleId,
    force: analysisStreaming,
    syncKey: `${analysisStreaming ? 1 : 0}:${showAnalysis ? 1 : 0}:${thought.length}:${thought}`,
  })

  return (
    <div
      ref={analysisScroll.ref}
      onScroll={analysisScroll.onScroll}
      className={`rounded-lg border border-border/80 bg-card/50 ${PHASE_CARD_SCROLL}`}
    >
      {failedLlm && hook.result.error && (
        <p className="text-sm text-red-600 dark:text-red-400 px-3 pt-3">{hook.result.error}</p>
      )}
      {displayResult.phase === 'analyzing' && !String(thought).trim() && (
        <p className="text-sm text-muted-foreground px-3 py-3">正在生成分析…</p>
      )}
      {showAnalysis && String(thought).trim() && (
        <div className="border-l-[3px] border-l-primary/45 px-3 py-3 sm:pl-4">
          <SolutionMarkdown content={thought} className="thinking-md" />
        </div>
      )}
    </div>
  )
}

function CodeCell({
  battleId,
  hook,
}: {
  battleId: string
  hook: ModelSideHook
}) {
  const { displayResult, showCode } = hook
  const raw = displayResult.code ?? ''
  const ct = displayResult.codingThought
  const useServerSplit =
    ct !== undefined && ct.trim().length > 0 && !rawCodeStillHasThinkingXml(raw)
  const split = useServerSplit
    ? { thinking: ct ?? '', code: raw }
    : splitThinkingFromModelCode(raw)
  const thinking = sanitizeCodingThoughtForDisplay(split.thinking)
  const codeForHighlight = stripCodeFences(split.code)

  const [thinkingOpen, setThinkingOpen] = useState(true)
  useEffect(() => {
    setThinkingOpen(true)
  }, [battleId])

  const codeStreaming = displayResult.phase === 'coding'
  const codePhaseScroll = useStickToBottomScroll({
    resetKey: battleId,
    force: codeStreaming,
    syncKey: `${thinkingOpen ? 1 : 0}:${thinking.length}:${codeForHighlight.length}:${raw}`,
  })

  return (
    <div
      ref={codePhaseScroll.ref}
      onScroll={codePhaseScroll.onScroll}
      className={`rounded-lg border border-border/80 bg-card/50 ${PHASE_CARD_SCROLL}`}
    >
      {displayResult.phase === 'coding' && !raw && (
        <p className="text-sm text-muted-foreground px-3 py-3">正在生成代码…</p>
      )}
      {showCode && raw && (
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
                <SolutionMarkdown content={thinking} className="thinking-md" />
              </div>
            </details>
          ) : null}
          {codeForHighlight ? (
            <div className={CODE_BLOCK_INNER}>
              <JavaScriptCodeBlock
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
      className={`rounded-lg border border-border/80 bg-card/50 p-3 space-y-2 ${PHASE_CARD_SCROLL}`}
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
  /** 服务端仍在流式写模型输出时，主列 <main> 跟随滚到底 */
  streamBattle?: boolean
}

/** 对战内容变高时滚动外层 <main>；流式 / 跑官方用例时强制粘底 */
function BattleMainAutoScroll({
  battleId,
  force,
  thoughtA,
  codeA,
  thoughtB,
  codeB,
  runDoneA,
  runDoneB,
}: {
  battleId: string
  force: boolean
  thoughtA?: string
  codeA?: string
  thoughtB?: string
  codeB?: string
  runDoneA?: number
  runDoneB?: number
}) {
  const stickRef = useRef(true)
  useLayoutEffect(() => {
    stickRef.current = true
  }, [battleId])

  useLayoutEffect(() => {
    const main = document.querySelector('main')
    if (!main) return
    if (force || stickRef.current) {
      main.scrollTop = main.scrollHeight
    }
  }, [force, battleId, thoughtA, codeA, thoughtB, codeB, runDoneA, runDoneB])

  useEffect(() => {
    const main = document.querySelector('main')
    if (!main) return
    const onScroll = () => {
      if (force) return
      const d = main.scrollHeight - main.scrollTop - main.clientHeight
      stickRef.current = d <= MAIN_STICK_NEAR_PX
    }
    main.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => main.removeEventListener('scroll', onScroll)
  }, [force])

  return null
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
  streamBattle = false,
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

  const mainScrollForce =
    streamBattle || hookA.runningOfficial || hookB.runningOfficial

  return (
    <>
      <BattleMainAutoScroll
        battleId={battleId}
        force={mainScrollForce}
        thoughtA={resultA.thought}
        codeA={resultA.code}
        thoughtB={resultB.thought}
        codeB={resultB.code}
        runDoneA={hookA.runProgress?.done}
        runDoneB={hookB.runProgress?.done}
      />
      <div className="grid min-h-0 grid-cols-1 gap-y-8 sm:grid-cols-2 sm:gap-x-8 sm:gap-y-0 sm:items-stretch">
        <ModelColumn battleId={battleId} label={modelAName} hook={hookA} />
        <ModelColumn battleId={battleId} label={modelBName} hook={hookB} />
      </div>
    </>
  )
}
