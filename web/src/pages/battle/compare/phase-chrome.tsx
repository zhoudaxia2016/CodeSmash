import type { ReactNode } from 'react'
import { activityLabel } from '@/hooks/useBattleModelSide'
import { PHASE_MAX_H } from '../lib/battlePhaseLayout'
import type { ModelSideHook } from '../lib/battleTypes'

/** 单列内的阶段标题（每侧模型各自一条，不跨列） */
export function PhaseColumnHeading({ children }: { children: ReactNode }) {
  return (
    <h3 className="border-b border-border/60 pb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </h3>
  )
}

type ColumnHeaderProps = { label: string; hook: ModelSideHook }

export function ColumnHeader({ label, hook }: ColumnHeaderProps) {
  const { displayResult, ok, failedLlm } = hook
  return (
    <div className="flex min-h-0 flex-wrap items-center gap-2">
      <span className="font-semibold leading-tight text-foreground">{label}</span>
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

/** 同阶段另一侧尚未进入时占满格高，与对侧卡片对齐 */
export function PhasePairedPlaceholder({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      <div
        className={`flex min-h-[5rem] flex-1 flex-col justify-center overflow-hidden rounded-lg border border-dashed border-border/50 bg-muted/10 px-3 py-4 text-center text-sm text-muted-foreground ${PHASE_MAX_H}`}
      >
        {children}
      </div>
    </div>
  )
}
