import { type SiteLocale, buildLocaleMetadata } from '@/lib/site-config'
import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { PricingPageView } from './pricing-page-view'

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale: requestedLocale } = await params
  const locale: SiteLocale = requestedLocale === 'ro' ? 'ro' : 'en'
  return buildLocaleMetadata(locale, {
    path: '/pricing',
    title: locale === 'ro' ? 'Prețuri Sneepcut' : 'Sneepcut pricing',
    description:
      locale === 'ro'
        ? 'Compară planurile Sneepcut și alege volumul de procesare potrivit pentru fluxul tău video.'
        : 'Compare Sneepcut plans and choose the processing capacity that fits your video workflow.'
  })
}

export default async function PricingPage({
  params
}: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('pricing')
  const tLanding = await getTranslations('landing')
  const tBilling = await getTranslations('billing')
  return (
    <PricingPageView
      locale={locale}
      t={t}
      tLanding={tLanding}
      tBilling={tBilling}
    />
  )
}
