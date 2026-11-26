import { notFound } from 'next/navigation'
import { isLegalDocumentId, LEGAL_DOCUMENT_IDS } from '@/content/legal/documents'
import { legalMetadata } from '@/lib/page-metadata'
import { LegalPage } from '@/views/legal-page'

type Props = { params: Promise<{ document: string }> }

export const dynamicParams = false

export function generateStaticParams() {
  return LEGAL_DOCUMENT_IDS.map((document) => ({ document }))
}

export async function generateMetadata({ params }: Props) {
  const { document } = await params
  return isLegalDocumentId(document) ? legalMetadata('es', document) : {}
}

export default async function Page({ params }: Props) {
  const { document } = await params
  if (!isLegalDocumentId(document)) notFound()
  return <LegalPage locale="es" id={document} />
}
