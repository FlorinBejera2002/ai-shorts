import { type SiteLocale, buildLocaleMetadata } from '@/lib/site-config'
import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { TermsPageView } from './terms-page-view'

export async function generateMetadata({
  params
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale: requestedLocale } = await params
  const locale: SiteLocale = requestedLocale === 'ro' ? 'ro' : 'en'
  return buildLocaleMetadata(locale, {
    path: '/terms',
    title:
      locale === 'ro'
        ? 'Termeni și condiții Sneepcut'
        : 'Sneepcut Terms of Service',
    description:
      locale === 'ro'
        ? 'Condițiile care reglementează conturile, conținutul, planurile și utilizarea acceptabilă a serviciului Sneepcut.'
        : 'The terms governing accounts, content, plans, and acceptable use of the Sneepcut service.'
  })
}

export default async function TermsPage({
  params
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale: requestedLocale } = await params
  const locale: SiteLocale = requestedLocale === 'ro' ? 'ro' : 'en'
  setRequestLocale(locale)
  const t = await getTranslations('landing')
  return <TermsPageView locale={locale} t={t} />
}
