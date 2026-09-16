import { LegalPageView } from '@/components/landing/legal-page-view'
import { SUBPROCESSORS_COPY } from '@/lib/additional-legal-content'
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
    path: '/subprocessors',
    title:
      locale === 'ro'
        ? 'Subprocesatori — Sneep Cut'
        : 'Subprocessors — Sneep Cut',
    description:
      locale === 'ro'
        ? 'Furnizorii care pot prelucra date pentru Sneep Cut și rolurile acestora.'
        : 'Providers that may process data for Sneep Cut and their roles.'
  })
}

export default async function SubprocessorsPage({
  params
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale: requestedLocale } = await params
  const locale: SiteLocale = requestedLocale === 'ro' ? 'ro' : 'en'
  setRequestLocale(locale)
  const t = await getTranslations('landing')
  return <LegalPageView copy={SUBPROCESSORS_COPY[locale]} t={t} />
}
