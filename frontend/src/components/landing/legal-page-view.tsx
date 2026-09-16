import { LegalDocument } from '@/components/landing/legal-document'
import { PublicFooter } from '@/components/landing/public-footer'
import { PublicNavbar } from '@/components/landing/public-navbar'
import { LEGAL_OPERATOR, type LegalDocumentCopy } from '@/lib/legal-content'
import { getContactEmail } from '@/lib/site-config'
import type { getTranslations } from 'next-intl/server'

export function LegalPageView({
  copy,
  t,
  contactEmail = LEGAL_OPERATOR.privacyEmail
}: {
  copy: LegalDocumentCopy
  t: Awaited<ReturnType<typeof getTranslations>>
  contactEmail?: string
}) {
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
        contactEmail={getContactEmail() || contactEmail}
      />
      <PublicFooter />
    </main>
  )
}
