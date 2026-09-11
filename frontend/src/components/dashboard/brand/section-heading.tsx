import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

export function SectionHeading({
  icon: Icon,
  title,
  description,
  action
}: {
  icon: LucideIcon
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="flex min-w-0 flex-1 gap-2.5">
        <span className="brand-section-icon flex size-8 shrink-0 items-center justify-center rounded-md">
          <Icon aria-hidden="true" className="size-4" />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold tracking-[-0.02em]">
            {title}
          </h2>
          <p className="mt-0.5 max-w-xl text-[11px] leading-relaxed text-muted-foreground">
            {description}
          </p>
        </div>
      </div>
      {action}
    </div>
  )
}
