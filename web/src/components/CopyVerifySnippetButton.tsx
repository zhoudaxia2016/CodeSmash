import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'

type Props = {
  text: string
  label?: string
  className?: string
  disabled?: boolean
}

export function CopyVerifySnippetButton({ text, label = '复制验证代码', className, disabled }: Props) {
  const [done, setDone] = useState(false)

  const handle = async () => {
    if (disabled) return
    try {
      await navigator.clipboard.writeText(text)
      setDone(true)
      window.setTimeout(() => setDone(false), 2000)
    } catch {
      setDone(false)
    }
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={`h-7 gap-1 px-2 text-[11px] font-medium ${className ?? ''}`}
      disabled={disabled}
      onClick={handle}
      title="复制模型代码 + console.log(main(...))，可反复粘贴到 Node/控制台运行（无 const，避免重复声明）"
    >
      {done ? <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
      {done ? '已复制' : label}
    </Button>
  )
}
