import type { BillingConfiguration } from './types'

type StripeResource = 'customers' | 'subscriptions' | 'events'
const objectPrefixes: Record<StripeResource, string> = { customers: 'cus_', subscriptions: 'sub_', events: 'evt_' }

// Stripe documents account-scoped Dashboard links with /test/ only for sandboxes.
export function stripeDashboardLink(configuration: BillingConfiguration | null, resource?: StripeResource, id?: string | null) {
  if (!configuration || !['test', 'live'].includes(configuration.mode)) return null
  if (!configuration.expectedAccountId || !/^acct_[a-zA-Z0-9]+$/.test(configuration.expectedAccountId)) return null
  const base = `https://dashboard.stripe.com/${configuration.expectedAccountId}/${configuration.mode === 'test' ? 'test/' : ''}`
  if (!resource) return base + 'dashboard'
  if (!id || !new RegExp(`^${objectPrefixes[resource]}[a-zA-Z0-9]+$`).test(id)) return null
  return `${base}${resource}/${id}`
}
