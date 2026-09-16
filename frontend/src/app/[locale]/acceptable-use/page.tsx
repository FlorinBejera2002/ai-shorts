import { LegalPageView } from '@/components/landing/legal-page-view'
import { ACCEPTABLE_USE_COPY } from '@/lib/additional-legal-content'
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
    path: '/acceptable-use',
    title:
      locale === 'ro'
        ? 'Politica de utilizare acceptabilă — Sneep Cut'
        : 'Acceptable Use Policy — Sneep Cut',
    description:
      locale === 'ro'
        ? 'Regulile pentru utilizarea legală, sigură și responsabilă a Sneep Cut.'
        : 'Rules for lawful, safe, and responsible use of Sneep Cut.'
  })
}

export default async function AcceptableUsePage({
  params
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale: requestedLocale } = await params
  const locale: SiteLocale = requestedLocale === 'ro' ? 'ro' : 'en'
  setRequestLocale(locale)
  const t = await getTranslations('landing')
  return <LegalPageView copy={ACCEPTABLE_USE_COPY[locale]} t={t} />
}
