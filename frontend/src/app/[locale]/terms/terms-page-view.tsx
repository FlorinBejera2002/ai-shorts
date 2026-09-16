import { LegalDocument } from '@/components/landing/legal-document'
import { PublicFooter } from '@/components/landing/public-footer'
import { PublicNavbar } from '@/components/landing/public-navbar'
import { LEGAL_OPERATOR, TERMS_COPY } from '@/lib/legal-content'
import { type SiteLocale, getContactEmail } from '@/lib/site-config'
import type { getTranslations } from 'next-intl/server'

export function TermsPageView({
  locale,
  t
}: {
  locale: SiteLocale
  t: Awaited<ReturnType<typeof getTranslations>>
}) {
  const copy = TERMS_COPY[locale]

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <PublicNavbar
        labels={{
          pricing: t('pricing'),
          signIn: t('signIn'),
          getStarted: t('getStarted')
        }}
      />
      <LegalDocument
        {...copy}
        contactEmail={getContactEmail() || LEGAL_OPERATOR.email}
      />
      <PublicFooter />
    </main>
  )
}
