import type { LegalDocumentId } from '@/content/copy/types'
import type { Locale } from '@/lib/i18n'
import {
  ACCEPTABLE_USE_COPY,
  COOKIE_POLICY_COPY,
  DPA_COPY,
  LEGAL_NOTICE_COPY,
  REFUND_POLICY_COPY,
  SUBPROCESSORS_COPY
} from './additional-legal-content'
import {
  DATA_DELETION_COPY,
  PRIVACY_COPY,
  TERMS_COPY,
  type LegalDocumentCopy
} from './legal-content'

const documents: Record<LegalDocumentId, Record<Locale, LegalDocumentCopy>> = {
  'legal-notice': LEGAL_NOTICE_COPY,
  privacy: PRIVACY_COPY,
  terms: TERMS_COPY,
  'cookie-policy': COOKIE_POLICY_COPY,
  'acceptable-use': ACCEPTABLE_USE_COPY,
  'refund-policy': REFUND_POLICY_COPY,
  subprocessors: SUBPROCESSORS_COPY,
  dpa: DPA_COPY,
  'data-deletion': DATA_DELETION_COPY
}

/** Footer order from the canvas: two columns of legal links. */
export const LEGAL_DOCUMENT_IDS = Object.keys(documents) as LegalDocumentId[]

export function isLegalDocumentId(value: string): value is LegalDocumentId {
  return Object.hasOwn(documents, value)
}

export function getLegalDocument(id: LegalDocumentId, locale: Locale): LegalDocumentCopy {
  return documents[id][locale]
}
