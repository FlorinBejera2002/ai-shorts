/**
 * Ana & Radu illustrations. The admin-* files are drawn for the console; the
 * others are shared with the product (frontend/public/illustrations).
 * Swap a path here to change it everywhere in the console.
 */
export const illustrations = {
  login: '/illustrations/admin-login.webp',
  loadError: '/illustrations/load-error.webp',
  noResults: '/illustrations/clips-noresults.webp',
  usersNoResults: '/illustrations/admin-users-noresults.webp',
  auditEmpty: '/illustrations/admin-audit-empty.webp',
  activityEmpty: '/illustrations/admin-audit-empty.webp',
  billingEmpty: '/illustrations/admin-billing-empty.webp',
  suspend: '/illustrations/admin-suspend.webp',
  empty: '/illustrations/library-empty.webp',
  feedbackEmpty: '/illustrations/admin-feedback-empty.webp'
} as const

export type IllustrationName = keyof typeof illustrations
