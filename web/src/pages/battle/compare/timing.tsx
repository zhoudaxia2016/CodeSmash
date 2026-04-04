import { formatDurationSeconds } from '@/lib/formatDuration'
import type { ModelResult } from '@/types'

export function LabeledDuration({
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
export function CompactOfficialTiming({
  r,
  runningOfficial,
}: {
  r: ModelResult
  runningOfficial: boolean
}) {
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
          <LabeledDuration label="执行" ms={exec!} title="测试用例在本机执行耗时" />
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
