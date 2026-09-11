import { Card } from '@/components/ui/card'
import {
  CalendarClock,
  CheckCircle2,
  CreditCard,
  ShieldAlert,
  Sparkles,
  Zap
} from 'lucide-react'

import { PortalButton } from '@/components/billing/portal-button'
import {
  type BillingLocale,
  type BillingSubscription,
  estimateAvailableClips
} from '@/lib/billing'

type BillingSummaryLabels = {
  overview: string
  currentPlan: string
  creditsAvailable: string
  clipRunway: string
  clipRunwayValue: (values: { count: number }) => string
  creditsPerClip: string
  creditsRollover: string
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
  const clipRunway = estimateAvailableClips(credits)

  return (
    <Card
      as="section"
      className="block gap-0 py-0 relative overflow-hidden p-0 animate-slide-up"
      aria-labelledby="billing-overview-title"
    >
      <div className="grid lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,.65fr)]">
        <div className="p-5 sm:p-7">
          <div className="flex items-center gap-2 text-muted-foreground">
            <CreditCard
              className="h-4 w-4"
              strokeWidth={1.75}
              aria-hidden="true"
            />
            <h2
              id="billing-overview-title"
              className="text-xs font-semibold uppercase tracking-[0.14em]"
            >
              {labels.overview}
            </h2>
          </div>

          <div className="mt-7 flex flex-wrap items-center gap-3">
            <p className="text-3xl font-semibold tracking-tight sm:text-4xl">
              {planName}
            </p>
            {subscription ? (
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em] ${statusClass(subscription.status)}`}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
                <span className="sr-only">{labels.subscriptionStatus}: </span>
                {statusLabel}
              </span>
            ) : (
              <span className="rounded-full bg-muted px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
                {labels.currentPlan}
              </span>
            )}
          </div>

          <div className="mt-7 grid gap-4 border-t border-border pt-5 sm:grid-cols-2">
            <div>
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
            <div className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
              <CheckCircle2
                className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success"
                aria-hidden="true"
              />
              {labels.creditsRollover}
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
          {canManageBilling && (
            <div className="mt-6 sm:max-w-56">
              <PortalButton
                locale={locale}
                label={labels.manageBilling}
                loadingLabel={labels.openingPortal}
                errorLabel={labels.portalError}
                emphasized={true}
                className="w-full justify-center"
              />
            </div>
          )}
        </div>

        <div className="relative overflow-hidden border-t border-border bg-[#171a22] p-5 text-white sm:p-7 lg:border-l lg:border-t-0">
          <div className="absolute -right-16 -top-20 h-48 w-48 rounded-full bg-primary/25 blur-3xl" />
          <div className="relative">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs font-medium text-white/65">
                <Zap className="h-4 w-4 text-[#78a8ff]" aria-hidden="true" />
                {labels.creditsAvailable}
              </div>
              <Sparkles className="h-4 w-4 text-[#78a8ff]" aria-hidden="true" />
            </div>
            <p className="mt-8 text-5xl font-semibold tracking-[-0.04em] tabular-nums">
              {credits.toLocaleString(locale)}
            </p>
            <p className="mt-2 text-sm text-white/55">{labels.clipRunway}</p>
            <div className="mt-8 rounded-xl border border-white/10 bg-white/[0.055] p-4">
              <p className="text-2xl font-semibold tabular-nums">
                {labels.clipRunwayValue({ count: clipRunway })}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-white/55">
                {labels.creditsPerClip}
              </p>
            </div>
          </div>
        </div>
      </div>
    </Card>
  )
}
