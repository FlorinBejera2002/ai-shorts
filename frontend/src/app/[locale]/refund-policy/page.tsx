import { LegalPageView } from '@/components/landing/legal-page-view'
import { REFUND_POLICY_COPY } from '@/lib/additional-legal-content'
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
    path: '/refund-policy',
    title:
      locale === 'ro'
        ? 'Anulare și rambursare — Sneep Cut'
        : 'Refund and Cancellation Policy — Sneep Cut',
    description:
      locale === 'ro'
        ? 'Regulile Sneep Cut privind anularea, rambursarea, erorile de plată și retragerea legală.'
        : 'Sneep Cut rules for cancellation, refunds, billing errors, and statutory withdrawal.'
  })
}

export default async function RefundPolicyPage({
  params
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale: requestedLocale } = await params
  const locale: SiteLocale = requestedLocale === 'ro' ? 'ro' : 'en'
  setRequestLocale(locale)
  const t = await getTranslations('landing')
  return <LegalPageView copy={REFUND_POLICY_COPY[locale]} t={t} />
}
