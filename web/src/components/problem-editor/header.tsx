import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type Props = {
  title: string
  titleId: string
  onClose: () => void
  className?: string
}

/** 题目编辑区顶栏：标题与关闭。 */
export function ProblemEditorHeader({ title, titleId, onClose, className }: Props) {
  return (
    <div
      className={cn(
        'flex shrink-0 items-start justify-between gap-3 border-b border-border bg-card',
        className,
      )}
    >
      <h2
        id={titleId}
        className="min-w-0 flex-1 text-base font-semibold tracking-tight text-foreground"
      >
        {title}
      </h2>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0"
        onClick={onClose}
        aria-label="关闭"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  )
}
