import { useEffect, useState } from 'react'
import { highlightJavaScriptToHtml } from '@/lib/treeSitterJavaScript'

type Props = {
  code: string
  className?: string
}

export function JavaScriptCodeBlock({ code, className }: Props) {
  const [html, setHtml] = useState<string | null>(null)
  const [plainFallback, setPlainFallback] = useState(false)

  useEffect(() => {
    let alive = true
    setPlainFallback(false)
    setHtml(null)
    highlightJavaScriptToHtml(code)
      .then((h) => {
        if (!alive) return
        setHtml(h)
      })
      .catch((err) => {
        if (import.meta.env.DEV) console.warn('[tree-sitter highlight]', err)
        if (!alive) return
        setPlainFallback(true)
      })
    return () => {
      alive = false
    }
  }, [code])

  if (plainFallback) {
    return (
      <pre className={className}>
        <code>{code}</code>
      </pre>
    )
  }

  if (html === null) {
    return (
      <pre className={className}>
        <code>{code}</code>
      </pre>
    )
  }

  return (
    <pre className={className}>
      <code className="code-highlight-root" dangerouslySetInnerHTML={{ __html: html }} />
    </pre>
  )
}
