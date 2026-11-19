import { NotFoundView } from '@/components/site/not-found-view'
import { PageShell } from '@/components/site/page-shell'
import type { Locale } from '@/lib/i18n'

export function NotFoundPage({ locale }: { locale: Locale }) {
  return (
    <PageShell locale={locale} path="/">
      <NotFoundView locale={locale} />
    </PageShell>
  )
}
