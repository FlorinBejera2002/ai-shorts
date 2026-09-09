import {
  DataDeletionPageView,
} from '@/app/[locale]/data-deletion/data-deletion-page-view'
import { HomePageView } from '@/app/[locale]/home-page-view'
import { PricingPageView } from '@/app/[locale]/pricing/pricing-page-view'
import { PrivacyPageView } from '@/app/[locale]/privacy/privacy-page-view'
import { TermsPageView } from '@/app/[locale]/terms/terms-page-view'
import type { SiteLocale } from '@/lib/site-config'
import { useLocale, useTranslations } from 'next-intl'
import type { ComponentProps } from 'react'

function translationFor<T>(translation: unknown) {
  return translation as T
}

export function HomeRoute() {
  const locale = useLocale()
  const translation = useTranslations('landing')
  return (
    <HomePageView
      locale={locale}
      t={translationFor<ComponentProps<typeof HomePageView>['t']>(translation)}
    />
  )
}

export function PricingRoute() {
  const locale = useLocale()
  const pricing = useTranslations('pricing')
  const landing = useTranslations('landing')
  const billing = useTranslations('billing')
  return (
    <PricingPageView
      locale={locale}
      t={translationFor<ComponentProps<typeof PricingPageView>['t']>(pricing)}
      tLanding={translationFor<
        ComponentProps<typeof PricingPageView>['tLanding']
      >(landing)}
      tBilling={translationFor<
        ComponentProps<typeof PricingPageView>['tBilling']
      >(billing)}
    />
  )
}

function legalTranslation<T>(translation: unknown) {
  return translation as T
}

export function PrivacyRoute() {
  const locale = useLocale() as SiteLocale
  const translation = useTranslations('landing')
  return (
    <PrivacyPageView
      locale={locale}
      t={legalTranslation<
        ComponentProps<typeof PrivacyPageView>['t']
      >(translation)}
    />
  )
}

export function TermsRoute() {
  const locale = useLocale() as SiteLocale
  const translation = useTranslations('landing')
  return (
    <TermsPageView
      locale={locale}
      t={legalTranslation<ComponentProps<typeof TermsPageView>['t']>(
        translation
      )}
    />
  )
}

export function DataDeletionRoute() {
  const locale = useLocale()
  const translation = useTranslations('landing')
  return (
    <DataDeletionPageView
      locale={locale}
      t={legalTranslation<
        ComponentProps<typeof DataDeletionPageView>['t']
      >(translation)}
    />
  )
}
