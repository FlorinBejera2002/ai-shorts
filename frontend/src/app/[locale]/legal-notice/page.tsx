import { LegalPageView } from '@/components/landing/legal-page-view'
import { LEGAL_NOTICE_COPY } from '@/lib/additional-legal-content'
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
    path: '/legal-notice',
    title:
      locale === 'ro'
        ? 'Informații legale — Sneep Cut'
        : 'Legal Notice — Sneep Cut',
    description:
      locale === 'ro'
        ? 'Datele societății, informațiile de contact și identificarea operatorului Sneep Cut.'
        : 'Company, contact, and operator identification information for Sneep Cut.'
  })
}

export default async function LegalNoticePage({
  params
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale: requestedLocale } = await params
  const locale: SiteLocale = requestedLocale === 'ro' ? 'ro' : 'en'
  setRequestLocale(locale)
  const t = await getTranslations('landing')
  return <LegalPageView copy={LEGAL_NOTICE_COPY[locale]} t={t} />
}
