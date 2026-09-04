import { CalendarClock, CreditCard, ShieldAlert, Zap } from 'lucide-react'

import { PortalButton } from '@/components/billing/portal-button'
import type { BillingLocale, BillingSubscription } from '@/lib/billing'

type BillingSummaryLabels = {
  overview: string
  creditsAvailable: string
  plan: string
  subscriptionStatus: string
  renewsOn: string
  endsOn: string
  noActiveSubscription: string
  manageBilling: string
  openingPortal: string
  portalError: string
  providerStale: string
}

type BillingSummaryProps = {
  credits: number
  planName: string
  locale: BillingLocale
  subscription: BillingSubscription | null
  statusLabel: string
  hasBillingData: boolean
  canManageBilling: boolean
  providerAvailable: boolean
  labels: BillingSummaryLabels
}

function formatPeriodDate(value: string | null, locale: string): string | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null

  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  }).format(date)
}

function statusClass(status: string) {
  if (status === 'active' || status === 'trialing') {
    return 'bg-success/10 text-success'
  }
  if (status === 'past_due' || status === 'unpaid' || status === 'incomplete') {
    return 'bg-destructive/10 text-destructive'
  }
  return 'bg-muted text-muted-foreground'
}

export function BillingSummary({
  credits,
  planName,
  locale,
  subscription,
  statusLabel,
  hasBillingData,
  canManageBilling,
  providerAvailable,
  labels
}: BillingSummaryProps) {
  const periodDate = formatPeriodDate(
    subscription?.currentPeriodEnd ?? null,
    locale
  )

  return (
    <section
      className="panel relative mt-6 overflow-hidden p-0 animate-slide-up"
      aria-labelledby="billing-overview-title"
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-r from-primary/10 via-primary/[0.035] to-transparent"
        aria-hidden="true"
      />
      <div className="relative grid gap-5 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div>
          <div className="flex items-center gap-2">
            <CreditCard
              className="h-4 w-4 text-primary"
              strokeWidth={1.75}
              aria-hidden="true"
            />
            <h2 id="billing-overview-title" className="section-label">
              {labels.overview}
            </h2>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-border bg-background/70 p-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Zap className="h-3.5 w-3.5" aria-hidden="true" />
                {labels.creditsAvailable}
              </div>
              <p className="mt-2 text-3xl font-semibold tabular-nums">
                {credits.toLocaleString(locale)}
              </p>
            </div>

            <div className="rounded-xl border border-border bg-background/70 p-4">
              <p className="text-xs text-muted-foreground">{labels.plan}</p>
              <p className="mt-2 text-lg font-semibold">{planName}</p>
              {subscription ? (
                <span
                  className={`mt-2 inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-[0.1em] ${statusClass(subscription.status)}`}
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-current" />
                  <span className="sr-only">{labels.subscriptionStatus}: </span>
                  {statusLabel}
                </span>
              ) : (
                <p className="mt-2 text-xs text-muted-foreground">
                  {labels.noActiveSubscription}
                </p>
              )}
            </div>

            <div className="rounded-xl border border-border bg-background/70 p-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
                {subscription
                  ? subscription.cancelAtPeriodEnd
                    ? labels.endsOn
                    : labels.renewsOn
                  : labels.subscriptionStatus}
              </div>
              <p className="mt-2 text-sm font-semibold">
                {periodDate ??
                  (subscription ? '\u2014' : labels.noActiveSubscription)}
              </p>
            </div>
          </div>

          {!providerAvailable && hasBillingData && (
            <p className="mt-4 flex items-start gap-2 text-xs text-warning">
              <ShieldAlert
                className="mt-0.5 h-3.5 w-3.5 shrink-0"
                aria-hidden="true"
              />
              {labels.providerStale}
            </p>
          )}
        </div>

        {canManageBilling && (
          <PortalButton
            locale={locale}
            label={labels.manageBilling}
            loadingLabel={labels.openingPortal}
            errorLabel={labels.portalError}
            className="button-primary"
          />
        )}
      </div>
    </section>
  )
}
