import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { ComponentProps } from 'react'
import { ProblemEditorForm } from './form'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  titleId: string
} & Omit<ComponentProps<typeof ProblemEditorForm>, 'dialogTitle' | 'dialogTitleId' | 'onClose'>

export type ProblemEditorProps = Props

/**
 * 题目编辑：显隐、挂 body、区外点击与 Esc、顶栏与表单均在本组件内组合。
 */
export function ProblemEditor({
  open,
  onOpenChange,
  title,
  titleId,
  ...formProps
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      const node = e.target as Node | null
      if (!node) return
      if (rootRef.current?.contains(node)) return
      const el = e.target as HTMLElement
      if (el.closest?.('[data-page-header]')) return
      if (el.closest?.('[data-radix-popper-content-wrapper]')) return
      if (el.closest?.('[role="listbox"]')) return
      if (el.closest?.('button')) return
      if (el.closest?.('select')) return
      if (el.closest?.('input')) return
      onOpenChange(false)
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [open, onOpenChange])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onOpenChange])

  if (!open) return null

  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-4">
      <div
        ref={rootRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="pointer-events-auto flex h-[95vh] w-full max-w-4xl flex-col overflow-hidden rounded-t-xl border border-border bg-card text-sm shadow-lg sm:h-[90vh] sm:rounded-xl"
      >
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <ProblemEditorForm
            dialogTitle={title}
            dialogTitleId={titleId}
            onClose={() => onOpenChange(false)}
            {...formProps}
          />
        </div>
      </div>
    </div>,
    document.body,
  )
}
