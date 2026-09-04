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
    <div className="panel relative flex flex-col items-center justify-center overflow-hidden px-6 py-16 text-center animate-fade-in">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent" />
      <div className="icon-tile h-14 w-14 rounded-2xl">
        <Icon className="h-5 w-5" strokeWidth={1.75} />
      </div>
      <h2 className="mt-5 text-base font-semibold">{title}</h2>
      {description && (
        <p className="mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground">
          {description}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
