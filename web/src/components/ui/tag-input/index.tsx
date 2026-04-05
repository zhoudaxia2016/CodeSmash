import * as React from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

export type TagInputProps = {
  value: string[]
  onChange: (tags: string[]) => void
  /** 可选：题库中已有标签，点击即可加入当前题目（已选中的不会出现） */
  suggestions?: string[]
  placeholder?: string
  className?: string
  id?: string
  'aria-label'?: string
}

/** Chips + text field: Enter 添加标签，Backspace 在输入为空时删除最后一项 */
export function TagInput({
  value,
  onChange,
  suggestions = [],
  placeholder = '输入后按 Enter',
  className,
  id,
  'aria-label': ariaLabel,
}: TagInputProps) {
  const [draft, setDraft] = React.useState('')

  const commitDraft = () => {
    const t = draft.trim()
    if (!t) return
    const parts = t.split(/[,，]/).map((s) => s.trim()).filter(Boolean)
    if (parts.length === 0) return
    const next = [...value]
    for (const p of parts) {
      if (!next.includes(p)) next.push(p)
    }
    onChange(next)
    setDraft('')
  }

  const removeAt = (index: number) => {
    onChange(value.filter((_, i) => i !== index))
  }

  const pickable = suggestions.filter((t) => t.trim() && !value.includes(t))

  const addSuggestion = (t: string) => {
    if (value.includes(t)) return
    onChange([...value, t])
  }

  return (
    <div
      className={cn(
        'flex min-h-9 w-full flex-wrap items-center gap-1.5 rounded-md border border-input bg-background px-2 py-1.5 shadow-sm',
        'focus-within:ring-1 focus-within:ring-ring',
        className,
      )}
    >
      {value.map((tag, i) => (
        <span
          key={`${tag}-${i}`}
          className="inline-flex max-w-full items-center gap-0.5 rounded-md border border-border bg-muted/80 px-2 py-0.5 text-xs text-foreground"
        >
          <span className="truncate">{tag}</span>
          <button
            type="button"
            className="rounded p-0.5 text-muted-foreground hover:bg-background hover:text-foreground"
            onClick={() => removeAt(i)}
            aria-label={`移除标签 ${tag}`}
          >
            <X className="h-3 w-3 shrink-0" />
          </button>
        </span>
      ))}
      <input
        id={id}
        type="text"
        className="min-w-[6rem] flex-1 bg-transparent py-0.5 text-sm text-foreground outline-none placeholder:text-muted-foreground"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            commitDraft()
          } else if (e.key === 'Backspace' && draft === '' && value.length > 0) {
            e.preventDefault()
            onChange(value.slice(0, -1))
          }
        }}
        onBlur={() => commitDraft()}
        placeholder={value.length === 0 ? placeholder : ''}
        aria-label={ariaLabel ?? '添加标签'}
      />
      {pickable.length > 0 && (
        <div className="mt-1.5 w-full min-w-0 basis-full border-t border-border/60 pt-1.5">
          <span className="mb-1 block text-[11px] text-muted-foreground">已有标签</span>
          <div className="flex flex-wrap gap-1">
            {pickable.map((t) => (
              <button
                key={t}
                type="button"
                className="rounded-md border border-border bg-background px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:bg-muted/50 hover:text-foreground"
                onClick={() => addSuggestion(t)}
              >
                + {t}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
