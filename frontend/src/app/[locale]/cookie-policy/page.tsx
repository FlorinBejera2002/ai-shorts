import { LegalPageView } from '@/components/landing/legal-page-view'
import { COOKIE_POLICY_COPY } from '@/lib/additional-legal-content'
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
    path: '/cookie-policy',
    title:
      locale === 'ro'
        ? 'Politica privind cookie-urile — Sneep Cut'
        : 'Cookie Policy — Sneep Cut',
    description:
      locale === 'ro'
        ? 'Cookie-urile și stocarea în browser folosite de Sneep Cut și controalele disponibile.'
        : 'Cookies and browser storage used by Sneep Cut and the controls available to you.'
  })
}

export default async function CookiePolicyPage({
  params
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale: requestedLocale } = await params
  const locale: SiteLocale = requestedLocale === 'ro' ? 'ro' : 'en'
  setRequestLocale(locale)
  const t = await getTranslations('landing')
  return <LegalPageView copy={COOKIE_POLICY_COPY[locale]} t={t} />
}
