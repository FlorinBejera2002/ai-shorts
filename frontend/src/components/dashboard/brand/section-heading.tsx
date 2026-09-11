import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

export function SectionHeading({
  icon: Icon,
  eyebrow,
  title,
  description,
  action
}: {
  icon: LucideIcon
  eyebrow: string
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex min-w-0 gap-3">
        <span className="brand-section-icon flex size-9 shrink-0 items-center justify-center rounded-lg">
          <Icon aria-hidden="true" className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {eyebrow}
          </p>
          <h2 className="mt-0.5 text-base font-semibold tracking-[-0.02em]">
            {title}
          </h2>
          <p className="mt-1 max-w-xl text-xs leading-relaxed text-muted-foreground">
            {description}
          </p>
        </div>
      </div>
      {action}
    </div>
  )
}
