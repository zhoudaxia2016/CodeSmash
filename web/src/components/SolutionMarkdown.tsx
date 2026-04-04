import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import 'highlight.js/styles/github-dark.css'

type Props = {
  content: string
  className?: string
}

export function SolutionMarkdown({ content, className }: Props) {
  if (!content.trim()) return null

  return (
    <div
      className={[
        'solution-md prose prose-sm max-w-none text-foreground',
        'dark:prose-invert',
        'prose-headings:font-semibold prose-headings:tracking-tight prose-headings:text-foreground',
        'prose-p:text-foreground/90 prose-li:text-foreground/90',
        'prose-strong:text-foreground prose-code:text-foreground prose-code:before:content-none prose-code:after:content-none',
        'prose-pre:bg-transparent prose-pre:p-0 prose-pre:m-0',
        'prose-table:text-sm prose-th:border prose-td:border prose-th:border-border prose-td:border-border',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
        {content}
      </ReactMarkdown>
    </div>
  )
}
