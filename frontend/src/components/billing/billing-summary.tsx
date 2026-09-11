import { PortalButton } from '@/components/billing/portal-button'
import { Card } from '@/components/ui/card'
import {
  type BillingLocale,
  type BillingSubscription,
  estimateAvailableClips
} from '@/lib/billing'

type BillingSummaryLabels = {
  overview: string
  currentPlan: string
  creditsAvailable: string
  clipRunwayValue: (values: { count: number }) => string
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
  if (status === 'active' || status === 'trialing')
    return 'bg-success/10 text-success'
  if (status === 'past_due' || status === 'unpaid' || status === 'incomplete')
    return 'bg-destructive/10 text-destructive'
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
      className="gap-4 p-4"
      aria-labelledby="billing-overview-title"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 id="billing-overview-title" className="text-sm font-medium">
            {labels.overview}
          </h2>
          <span
            className={`rounded-sm px-2 py-1 text-[10px] font-medium ${subscription ? statusClass(subscription.status) : 'bg-muted text-muted-foreground'}`}
          >
            {subscription ? statusLabel : labels.currentPlan}
          </span>
        </div>
        {canManageBilling && (
          <PortalButton
            locale={locale}
            label={labels.manageBilling}
            loadingLabel={labels.openingPortal}
            errorLabel={labels.portalError}
            className="h-9 rounded-md px-3 text-xs"
          />
        )}
      </div>

      <div className="grid overflow-hidden rounded-md border border-border/70 bg-card sm:grid-cols-3 sm:divide-x sm:divide-border/70">
        <div className="p-3">
          <p className="text-[11px] text-muted-foreground">
            {labels.currentPlan}
          </p>
          <p className="mt-1 text-lg font-semibold">{planName}</p>
        </div>
        <div className="border-t border-border/70 p-3 sm:border-t-0">
          <p className="text-[11px] text-muted-foreground">
            {labels.creditsAvailable}
          </p>
          <p className="mt-1 text-lg font-semibold tabular-nums">
            {credits.toLocaleString(locale)}
          </p>
          <p className="text-[10px] text-muted-foreground">
            {labels.clipRunwayValue({ count: clipRunway })}
          </p>
        </div>
        <div className="border-t border-border/70 p-3 sm:border-t-0">
          <p className="text-[11px] text-muted-foreground">
            {subscription?.cancelAtPeriodEnd ? labels.endsOn : labels.renewsOn}
          </p>
          <p className="mt-1 text-sm font-semibold">
            {periodDate ?? labels.noActiveSubscription}
          </p>
        </div>
      </div>

      {!providerAvailable && hasBillingData && (
        <p className="text-xs text-warning">{labels.providerStale}</p>
      )}
    </Card>
  )
}
