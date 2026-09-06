import { Card, CardContent } from '@/components/ui/card'
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
    <Card className="relative gap-0 overflow-hidden border-dashed py-0 shadow-none">
      <CardContent className="flex flex-col items-center justify-center px-6 py-16 text-center">
        <div className="flex size-14 items-center justify-center rounded-xl border bg-muted/50 text-primary">
          <Icon className="h-5 w-5" strokeWidth={1.75} />
        </div>
        <h2 className="mt-5 text-base font-semibold">{title}</h2>
        {description && (
          <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
        )}
        {action && <div className="mt-5">{action}</div>}
      </CardContent>
    </Card>
  )
}
