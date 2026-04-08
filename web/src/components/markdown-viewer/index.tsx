import ReactMarkdown, { type Components } from 'react-markdown'
import remarkBreaks from 'remark-breaks'
import remarkGfm from 'remark-gfm'
import { CodeHighlight } from '@/components/code-highlight'

type Props = {
  content: string
  className?: string
}

const components: Components = {
  code({ className, children, ...props }) {
    const match = /language-(\w+)/.exec(className || '')
    const language = match ? match[1] : undefined
    const codeString = String(children).replace(/\n$/, '')

    const isInline = !className

    if (isInline) {
      return (
        <code className={className} {...props}>
          {children}
        </code>
      )
    }

    return (
      <CodeHighlight
        code={codeString}
        language={language}
        className="!my-0 !bg-muted/30 !p-3 overflow-x-auto rounded-md text-sm"
      />
    )
  },
  pre({ children }) {
    return <>{children}</>
  },
}

export function MarkdownViewer({ content, className }: Props) {
  if (!content.trim()) return null

  return (
    <div
      className={[
        'markdown-viewer prose prose-sm max-w-none text-foreground',
        'dark:prose-invert',
        'prose-headings:font-semibold prose-headings:tracking-tight prose-headings:text-foreground',
        'prose-p:leading-relaxed prose-p:text-muted-foreground prose-li:text-muted-foreground',
        'prose-strong:text-foreground prose-code:text-foreground prose-code:before:content-none prose-code:after:content-none',
        'prose-pre:bg-transparent prose-pre:p-0 prose-pre:m-0',
        'prose-table:text-sm prose-th:border prose-td:border prose-th:border-border prose-td:border-border',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  )
}
