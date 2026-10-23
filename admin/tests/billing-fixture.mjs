export function createBillingFixture() {
  return {
    overview: {
      configuration: { mode: 'test', expectedAccountId: 'acct_SyntheticTest', secretKeyConfigured: true, webhookConfigured: true, plansConfigured: true, portalConfigured: true, checkoutReady: true, portalReady: true },
      accounts: { billingProfiles: 27, subscriptions: 26, activeSubscriptions: 21, attentionRequired: 4, scheduledCancellations: 2 },
      plans: [{ plan: 'free', accounts: 6 }, { plan: 'creator', accounts: 15 }, { plan: 'pro', accounts: 5 }, { plan: 'agency', accounts: 1 }],
      statuses: [{ status: 'active', accounts: 21 }, { status: 'past_due', accounts: 3 }, { status: 'incomplete', accounts: 1 }, { status: 'canceled', accounts: 1 }, { status: 'none', accounts: 1 }],
      events: { processedTotal: 85, processedLast24Hours: 12, creditGrantsTotal: 29, lastProcessedAt: '2026-10-21T12:03:00Z' },
      eventFailuresAvailable: false
    },
    subscriptions: Array.from({ length: 27 }, (_, index) => ({
      id: `synthetic-user-${index + 1}`, email: `billing${index + 1}@example.invalid`, name: `Synthetic Billing ${index + 1}`,
      storedPlan: index === 1 ? 'pro' : 'creator', effectivePlan: index === 1 ? 'free' : 'creator', credits: index === 1 ? 260 : 1600,
      subscriptionStatus: index === 1 ? 'past_due' : 'active', customerId: `cus_Synthetic${index + 1}`, subscriptionId: `sub_Synthetic${index + 1}`,
      currentPeriodEnd: '2026-11-21T12:00:00Z', cancelAtPeriodEnd: index === 0, stateEventCreatedAt: '2026-10-21T12:00:00Z'
    })),
    events: { items: [
      { id: 'evt_SyntheticPaid', type: 'invoice.paid', processedAt: '2026-10-21T12:03:00Z', creditGrantId: 'invoice:in_SyntheticPaid' },
      { id: 'evt_SyntheticSubscription', type: 'customer.subscription.updated', processedAt: '2026-10-21T12:00:00Z', creditGrantId: null },
      { id: 'reconcile:sub_Synthetic1', type: 'subscription.reconciled', processedAt: '2026-10-21T11:00:00Z', creditGrantId: null }
    ] }
  }
}

export function filterBillingSubscriptions(fixture, params) {
  const query = (params.get('q') || '').toLowerCase()
  const status = params.get('status')
  const plan = params.get('plan')
  const page = Math.max(1, Number(params.get('page') || 1))
  const pageSize = Math.min(100, Math.max(1, Number(params.get('pageSize') || 25)))
  const filtered = fixture.subscriptions.filter((item) => (!query || [item.name, item.email, item.customerId, item.subscriptionId].some((value) => value?.toLowerCase().includes(query)))
    && (!status || item.subscriptionStatus === status) && (!plan || item.effectivePlan === plan))
  return { items: filtered.slice((page - 1) * pageSize, page * pageSize), total: filtered.length, page, pageSize }
}
