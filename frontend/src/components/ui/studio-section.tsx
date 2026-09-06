import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

export function StudioSection({
  title,
  description,
  icon: Icon,
  actions,
  children,
  className
}: {
  title: string
  description?: string
  icon?: LucideIcon
  actions?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <Card
      className={cn(
        'min-w-0 gap-0 overflow-hidden py-0 shadow-none',
        className
      )}
    >
      <CardHeader className="flex flex-wrap items-center justify-between gap-4 border-b bg-muted/25 px-5 py-5 sm:px-6">
        <div className="flex min-w-0 items-start gap-3">
          {Icon && (
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-card text-primary">
              <Icon className="size-4" aria-hidden="true" />
            </span>
          )}
          <div className="min-w-0 space-y-1.5">
            <CardTitle>
              <h2 className="text-base leading-snug tracking-tight">{title}</h2>
            </CardTitle>
            {description && (
              <CardDescription className="max-w-xl leading-relaxed">
                {description}
              </CardDescription>
            )}
          </div>
        </div>
        {actions}
      </CardHeader>
      <CardContent className="p-5 sm:p-6">{children}</CardContent>
    </Card>
  )
}
