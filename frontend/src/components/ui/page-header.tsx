import { BrandLogo } from '@/components/shared/brand-logo'
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
    <header className="studio-workbench-header relative flex flex-wrap items-end justify-between gap-5 pb-6">
      <div className="min-w-0">
        <div className="studio-workbench-eyebrow flex items-center gap-2">
          <BrandLogo variant="white-text" />
        </div>
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
        <div className="studio-workbench-actions flex shrink-0 items-center gap-2 pb-0.5">
          {actions}
        </div>
      )}
    </header>
  )
}
