import { type SiteLocale, buildLocaleMetadata } from '@/lib/site-config'
import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { PrivacyPageView } from './privacy-page-view'

export async function generateMetadata({
  params
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale: requestedLocale } = await params
  const locale: SiteLocale = requestedLocale === 'ro' ? 'ro' : 'en'
  return buildLocaleMetadata(locale, {
    path: '/privacy',
    title:
      locale === 'ro'
        ? 'Politica de confidențialitate Sneepcut'
        : 'Sneepcut Privacy Policy',
    description:
      locale === 'ro'
        ? 'Află ce date prelucrează Sneepcut, de ce le folosește și ce opțiuni ai pentru acces, export și ștergere.'
        : 'Learn what data Sneepcut processes, why it is used, and your options for access, export, and deletion.'
  })
}

export default async function PrivacyPage({
  params
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale: requestedLocale } = await params
  const locale: SiteLocale = requestedLocale === 'ro' ? 'ro' : 'en'
  setRequestLocale(locale)
  const t = await getTranslations('landing')
  return <PrivacyPageView locale={locale} t={t} />
}
