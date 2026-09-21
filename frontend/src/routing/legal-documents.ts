import {
  ACCEPTABLE_USE_COPY, COOKIE_POLICY_COPY, DPA_COPY, LEGAL_NOTICE_COPY,
  REFUND_POLICY_COPY, SUBPROCESSORS_COPY
} from '@/lib/additional-legal-content'

export const documents = {
  'acceptable-use': ACCEPTABLE_USE_COPY,
  'cookie-policy': COOKIE_POLICY_COPY,
  dpa: DPA_COPY,
  'legal-notice': LEGAL_NOTICE_COPY,
  'refund-policy': REFUND_POLICY_COPY,
  subprocessors: SUBPROCESSORS_COPY
}

export const additionalLegalPaths = Object.keys(documents) as Array<keyof typeof documents>

