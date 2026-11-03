import type { ContentPlatform } from '@/lib/content-calendar'
import type { ReactNode } from 'react'

/** Provider options are already grouped by the parent platform tabs. */
export function PostSettingsSection({
  idPrefix,
  title,
  children
}: {
  idPrefix: string
  provider: ContentPlatform
  title: string
  subtitle: string
  children: ReactNode
}) {
  return (
    <section aria-labelledby={idPrefix + '-title'} className="space-y-5">
      <h3 id={idPrefix + '-title'} className="sr-only">{title}</h3>
      {children}
    </section>
  )
}
