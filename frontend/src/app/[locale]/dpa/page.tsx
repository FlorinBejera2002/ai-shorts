import { LegalPageView } from '@/components/landing/legal-page-view'
import { DPA_COPY } from '@/lib/additional-legal-content'
import { type SiteLocale, buildLocaleMetadata } from '@/lib/site-config'
import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'

export async function generateMetadata({
  params
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale: requestedLocale } = await params
  const locale: SiteLocale = requestedLocale === 'ro' ? 'ro' : 'en'
  return buildLocaleMetadata(locale, {
    path: '/dpa',
    title:
      locale === 'ro'
        ? 'Acord privind prelucrarea datelor — Sneep Cut'
        : 'Data Processing Addendum — Sneep Cut',
    description:
      locale === 'ro'
        ? 'Termenii art. 28 GDPR pentru datele prelucrate de Sneep Cut în numele clienților business.'
        : 'GDPR Article 28 terms for data Sneep Cut processes on behalf of business customers.'
  })
}

export default async function DpaPage({
  params
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale: requestedLocale } = await params
  const locale: SiteLocale = requestedLocale === 'ro' ? 'ro' : 'en'
  setRequestLocale(locale)
  const t = await getTranslations('landing')
  return <LegalPageView copy={DPA_COPY[locale]} t={t} />
}
