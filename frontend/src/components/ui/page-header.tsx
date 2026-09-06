import { Badge } from '@/components/ui/badge'
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
    <header className="relative flex flex-wrap items-end justify-between gap-5 pb-6">
      <div className="min-w-0">
        <Badge
          variant="outline"
          className="mb-4 gap-2 rounded-md border-primary/20 bg-primary/5 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.16em] text-primary"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-primary" />
          sneepcut studio
        </Badge>
        <h1 className="text-3xl font-semibold tracking-[-0.045em] sm:text-[2.5rem]">
          {title}
        </h1>
        {description && (
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
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
