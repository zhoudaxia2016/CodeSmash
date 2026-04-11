import type { ReactNode } from 'react'

type PageHeaderProps = {
  title: string
  children?: ReactNode
}

export function PageHeader({ title, children }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between lg:gap-6">
      <h1 className="shrink-0 text-xl font-semibold tracking-tight text-foreground">
        {title}
      </h1>
      {children && (
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 lg:justify-end">
          {children}
        </div>
      )}
    </div>
  )
}
