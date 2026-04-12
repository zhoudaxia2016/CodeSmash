import type { ReactNode } from 'react'

type HeaderProps = {
  title: ReactNode
  children?: ReactNode
}

export function Header({ title, children }: HeaderProps) {
  return (
    <div
      data-page-header
      className="fixed inset-x-0 top-0 z-30 h-16 border-b border-border/80 bg-arena-header-blur/85 backdrop-blur-md supports-[backdrop-filter]:bg-background/75 lg:left-64"
    >
      <div className="mx-auto flex h-full w-full max-w-7xl items-center gap-4 px-4 sm:px-6 lg:px-10">
        <h1 className="shrink-0 truncate text-xl font-semibold tracking-tight text-foreground leading-none">
          {title}
        </h1>
        <div className="flex min-w-0 flex-1 items-center justify-end gap-2 overflow-x-auto whitespace-nowrap">
          {children}
        </div>
      </div>
    </div>
  )
}
