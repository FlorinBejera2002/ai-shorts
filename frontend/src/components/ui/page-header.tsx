import type { ReactNode } from 'react'

/**
 * Consistent page header for dashboard pages: title, optional
 * description, and an optional action slot on the right.
 */
export function PageHeader({
  title,
  description,
  actions
}: {
  title: string
  description?: string
  actions?: ReactNode
}) {
  return (
    <header className="relative flex flex-wrap items-end justify-between gap-5 border-b border-border pb-7">
      <div className="min-w-0">
        <div className="eyebrow mb-3 flex items-center gap-2 text-primary">
          <span className="h-1.5 w-1.5 rounded-full bg-primary" />
          sneepcut studio
        </div>
        <h1 className="text-3xl font-semibold tracking-[-0.045em] sm:text-4xl">
          {title}
        </h1>
        {description && (
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex shrink-0 items-center gap-2 pb-0.5">{actions}</div>
      )}
    </header>
  )
}
