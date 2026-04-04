import ReactMarkdown from 'react-markdown'
import remarkBreaks from 'remark-breaks'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import 'highlight.js/styles/github-dark.css'

type Props = {
  content: string
  className?: string
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
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        rehypePlugins={[rehypeHighlight]}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
