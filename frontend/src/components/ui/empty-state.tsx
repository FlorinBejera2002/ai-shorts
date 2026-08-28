import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

/**
 * Consistent empty state: soft icon tile, title, description, optional action.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action
}: {
  icon: LucideIcon
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="relative flex flex-col items-center justify-center overflow-hidden rounded-2xl border border-dashed border-border bg-card/80 px-6 py-16 text-center shadow-[0_18px_60px_rgba(0,0,0,.05)] animate-fade-in">
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-primary to-transparent" />
      <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-border bg-muted/60 transition-transform duration-500 hover:rotate-6">
        <Icon className="h-5 w-5 text-primary" strokeWidth={1.75} />
      </div>
      <h2 className="mt-4 text-sm font-semibold">{title}</h2>
      {description && (
        <p className="mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground">
          {description}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
