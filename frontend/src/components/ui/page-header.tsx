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
    <div className="relative flex flex-wrap items-end justify-between gap-5 border-b border-border pb-6 before:absolute before:-bottom-px before:left-0 before:h-px before:w-16 before:bg-primary">
      <div className="min-w-0">
        <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.22em] text-primary"><span className="h-1.5 w-1.5 rounded-full bg-primary" />ClipForge studio</div>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
        {description && (
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  )
}
