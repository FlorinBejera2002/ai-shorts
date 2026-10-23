export type BillingConfiguration = {
  mode: string
  expectedAccountId: string | null
  secretKeyConfigured: boolean
  webhookConfigured: boolean
  plansConfigured: boolean
  portalConfigured: boolean
  checkoutReady: boolean
  portalReady: boolean
}

export type BillingOverview = {
  configuration: BillingConfiguration
  accounts: {
    billingProfiles: number
    subscriptions: number
    activeSubscriptions: number
    attentionRequired: number
    scheduledCancellations: number
  }
  plans: { plan: string; accounts: number }[]
  statuses: { status: string; accounts: number }[]
  events: {
    processedTotal: number
    processedLast24Hours: number
    creditGrantsTotal: number
    lastProcessedAt: string | null
  }
  eventFailuresAvailable: boolean
}

export type BillingSubscription = {
  id: string
  email: string
  name: string | null
  storedPlan: string
  effectivePlan: string
  credits: number
  subscriptionStatus: string
  customerId: string | null
  subscriptionId: string | null
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
  stateEventCreatedAt: string | null
}

export type BillingSubscriptions = {
  items: BillingSubscription[]
  total: number
  page: number
  pageSize: number
}

export type BillingEvent = {
  id: string
  type: string
  processedAt: string
  creditGrantId: string | null
}

export type BillingEvents = { items: BillingEvent[] }
