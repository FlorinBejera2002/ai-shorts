import type { Metadata } from 'next'
import { NotFoundView } from '@/components/site/not-found-view'
import { PageShell } from '@/components/site/page-shell'
import { getCopy } from '@/content/copy'
import type { Locale } from '@/lib/i18n'

export function notFoundMetadata(locale: Locale): Metadata {
  return {
    title: { absolute: getCopy(locale).meta.notFoundTitle },
    robots: { index: false, follow: false }
  }
}

export function NotFoundPage({ locale }: { locale: Locale }) {
  return (
    <PageShell locale={locale} path="/">
      <NotFoundView locale={locale} />
    </PageShell>
  )
}
