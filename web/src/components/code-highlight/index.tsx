import { useEffect, useState } from 'react'
import { highlightJavaScriptToHtml } from './lib/tree-sitter-javascript'

type Props = {
  code: string
  language?: string
  className?: string
}

export function CodeHighlight({ code, language, className }: Props) {
  const [html, setHtml] = useState<string | null>(null)
  const [plainFallback, setPlainFallback] = useState(false)

  useEffect(() => {
    let alive = true
    setPlainFallback(false)
    setHtml(null)

    const lang = (language || '').toLowerCase()

    if (lang === 'javascript' || lang === 'js' || lang === 'typescript' || lang === 'ts' || lang === '' || !lang) {
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
    } else {
      setPlainFallback(true)
    }

    return () => {
      alive = false
    }
  }, [code, language])

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
