import { LegalDocument } from '@/components/legal/legal-document'
import { JsonLd } from '@/components/seo/json-ld'
import { PageShell } from '@/components/site/page-shell'
import { getCopy } from '@/content/copy'
import type { LegalDocumentId } from '@/content/copy/types'
import { getLegalDocument } from '@/content/legal/documents'
import type { Locale } from '@/lib/i18n'
import { contactEmail } from '@/lib/site'
import { breadcrumbJsonLd } from '@/lib/structured-data'

export function LegalPage({ locale, id }: { locale: Locale; id: LegalDocumentId }) {
  const copy = getCopy(locale)
  const document = getLegalDocument(id, locale)

  return (
    <PageShell locale={locale} path={`/${id}`}>
      <JsonLd data={breadcrumbJsonLd(locale, 'Sneep Cut', { name: document.title, path: `/${id}` })} />
      <LegalDocument document={document} contactEmail={contactEmail()} labels={copy.legal} />
    </PageShell>
  )
}
