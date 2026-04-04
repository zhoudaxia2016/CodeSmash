/** 同阶段两列共用的最大高度；滚动条在列内各自出现 */
export const PHASE_MAX_H = 'max-h-[min(84vh,44rem)]'

export const PHASE_CARD_OUTER = `flex min-h-0 ${PHASE_MAX_H} flex-1 flex-col overflow-hidden rounded-lg border border-border/80 bg-card/50`

export const PHASE_CARD_INNER_SCROLL = 'min-h-0 flex-1 overflow-y-auto overflow-x-hidden'

/** 并排阶段行：两列同高（stretch），每列内部独立滚动 */
export const PHASE_PAIR_GRID =
  'grid min-h-0 grid-cols-1 items-stretch gap-3 sm:grid-cols-2 sm:gap-x-5 sm:gap-y-3'

/** 代码块内层：无额外 border，仅底色与横向滚动 */
export const CODE_BLOCK_INNER = 'rounded-md bg-muted/20 p-3 overflow-x-auto'

export const MAIN_STICK_NEAR_PX = 80
