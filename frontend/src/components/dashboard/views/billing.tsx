'use client'

import { usePlanCatalog } from '@/components/billing/use-plan-catalog'
import { ApiState } from '@/components/shared/api-state'
import { Card } from '@/components/ui/card'
import { useApiResource } from '@/hooks/use-api-resource'
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Info,
  LoaderCircle,
  ShieldCheck
} from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

import { BillingSummary } from '@/components/billing/billing-summary'
import { CheckoutButton } from '@/components/billing/checkout-button'
import { InvoiceHistory } from '@/components/billing/invoice-history'
import { PortalButton } from '@/components/billing/portal-button'
import { PageHeader } from '@/components/ui/page-header'
import {
  type BillingPlanId,
  INITIAL_FREE_CREDITS,
  PLAN_CREDITS,
  canStartPlanCheckout,
  isPaidBillingPlanId,
  isTerminalSubscriptionStatus,
  normalizeBillingLocale,
  normalizeBillingPlan
} from '@/lib/billing'
import type { BillingData, BillingPlanPrice } from '@/types/api'

type Plan = {
  id: BillingPlanId
  name: string
  description: string
  price: string
  period: string
  credits: string
  features: string[]
  highlighted?: boolean
}

function formatPlanPrice(
  price: BillingPlanPrice | undefined,
  locale: 'en' | 'ro',
  unavailable: string
) {
  if (!price) return unavailable
  return new Intl.NumberFormat(locale === 'ro' ? 'ro-RO' : 'en-US', {
    style: 'currency',
    currency: price.currency,
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: price.amount % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2
  }).format(price.amount / 100)
}

export default function BillingPage() {
  return (
    <Suspense fallback={<ApiState />}>
      <BillingPageContent />
    </Suspense>
  )
}

function BillingPageContent() {
  const locale = normalizeBillingLocale(useLocale())
  const t = useTranslations('billing')
  const search = useSearchParams()
  const billingSearch = new URLSearchParams(search)
  billingSearch.delete('tab')
  const query = Object.fromEntries(billingSearch)
  const { data, error, reload } = useApiResource<BillingData>(
    `/api/stripe/billing?${billingSearch}`
  )
  const planCatalog = usePlanCatalog()
  if (!data) return <ApiState error={error} retry={reload} />
  const {
    account: user,
    subscription,
    providerAvailable,
    checkoutVerification
  } = data

  const plans: Plan[] = [
    {
      id: 'free',
      name: t('free'),
      description: t('planDescriptions.free'),
      price: '$0',
      period: t('periodForever'),
      credits: t('creditsOnSignup', { credits: INITIAL_FREE_CREDITS }),
      features: [
        t('features.freeClips'),
        t('features.standardQuality'),
        t('features.export720')
      ]
    },
    {
      id: 'creator',
      name: t('creator'),
      description: t('planDescriptions.creator'),
      price: formatPlanPrice(planCatalog?.creator, locale, t('unavailable')),
      period: t('periodMonth'),
      credits: t('creditsMonthly', { credits: PLAN_CREDITS.creator }),
      features: [
        t('features.creatorClips'),
        t('features.hdQuality'),
        t('features.export1080'),
        t('features.brandKit')
      ],
      highlighted: true
    },
    {
      id: 'pro',
      name: t('pro'),
      description: t('planDescriptions.pro'),
      price: formatPlanPrice(planCatalog?.pro, locale, t('unavailable')),
      period: t('periodMonth'),
      credits: t('creditsMonthly', { credits: PLAN_CREDITS.pro }),
      features: [
        t('features.unlimitedClips'),
        t('features.quality4k'),
        t('features.priorityProcessing'),
        t('features.brandKit'),
        t('features.apiAccess')
      ]
    },
    {
      id: 'agency',
      name: t('agency'),
      description: t('planDescriptions.agency'),
      price: formatPlanPrice(planCatalog?.agency, locale, t('unavailable')),
      period: t('periodMonth'),
      credits: t('creditsMonthly', {
        credits: PLAN_CREDITS.agency.toLocaleString(locale)
      }),
      features: [
        t('features.everythingPro'),
        t('features.teamAccounts'),
        t('features.whiteLabel'),
        t('features.dedicatedSupport')
      ]
    }
  ]

  const currentPlan = normalizeBillingPlan(user.plan)
  const currentPlanName =
    plans.find((plan) => plan.id === currentPlan)?.name ?? t('free')
  const hasSubscription = Boolean(
    subscription && !isTerminalSubscriptionStatus(subscription.status)
  )
  const hasBillingData = user.hasBillingProfile || Boolean(subscription)
  const subscriptionStatuses = {
    active: t('statuses.active'),
    trialing: t('statuses.trialing'),
    past_due: t('statuses.pastDue'),
    unpaid: t('statuses.unpaid'),
    incomplete: t('statuses.incomplete'),
    incomplete_expired: t('statuses.incompleteExpired'),
    canceled: t('statuses.canceled'),
    paused: t('statuses.paused'),
    unknown: t('statuses.unknown')
  }
  const subscriptionStatusLabel = subscription
    ? (subscriptionStatuses[
        subscription.status as keyof typeof subscriptionStatuses
      ] ?? subscriptionStatuses.unknown)
    : subscriptionStatuses.unknown

  return (
    <div className="billing-workspace dashboard-workspace animate-fade-in">
      <PageHeader title={t('title')} description={t('desc')} />

      {checkoutVerification?.status === 'complete' && (
        <div
          className="mt-4 flex items-start gap-3 rounded-md border border-success/25 bg-success/10 px-3 py-2.5 text-success"
          role="status"
        >
          <CheckCircle2
            className="mt-0.5 h-4 w-4 shrink-0"
            aria-hidden="true"
          />
          <p className="text-sm font-medium">{t('checkoutSuccess')}</p>
        </div>
      )}
      {checkoutVerification?.status === 'pending' && (
        <div
          className="mt-4 flex items-start gap-3 rounded-md border border-primary/20 bg-primary/5 px-3 py-2.5 text-foreground"
          role="status"
        >
          <LoaderCircle
            className="mt-0.5 h-4 w-4 shrink-0 text-primary"
            aria-hidden="true"
          />
          <p className="text-sm font-medium">{t('checkoutPending')}</p>
        </div>
      )}
      {checkoutVerification?.status === 'invalid' && (
        <div
          className="mt-4 flex items-start gap-3 rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2.5 text-destructive"
          role="alert"
        >
          <AlertTriangle
            className="mt-0.5 h-4 w-4 shrink-0"
            aria-hidden="true"
          />
          <p className="text-sm font-medium">
            {t('checkoutVerificationFailed')}
          </p>
        </div>
      )}
      {checkoutVerification?.status === 'unavailable' && (
        <div
          className="mt-4 flex items-start gap-3 rounded-md border border-warning/25 bg-warning/10 px-3 py-2.5 text-warning"
          role="alert"
        >
          <AlertTriangle
            className="mt-0.5 h-4 w-4 shrink-0"
            aria-hidden="true"
          />
          <p className="text-sm font-medium">
            {t('checkoutVerificationUnavailable')}
          </p>
        </div>
      )}
      {query.canceled === 'true' && !checkoutVerification && (
        <div
          className="mt-4 flex items-start gap-3 rounded-md border border-warning/25 bg-warning/10 px-3 py-2.5 text-warning"
          role="status"
        >
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p className="text-sm font-medium">{t('checkoutCanceled')}</p>
        </div>
      )}

      <BillingSummary
        credits={user.credits}
        planName={currentPlanName}
        locale={locale}
        subscription={subscription}
        statusLabel={subscriptionStatusLabel}
        hasBillingData={hasBillingData}
        canManageBilling={user.hasBillingProfile}
        providerAvailable={providerAvailable}
        labels={{
          overview: t('overviewTitle'),
          currentPlan: t('currentPlan'),
          creditsAvailable: t('creditsAvailable'),
          clipRunwayValue: ({ count }) => t('clipRunwayValue', { count }),
          renewsOn: t('renewsOn'),
          endsOn: t('endsOn'),
          noActiveSubscription: t('noActiveSubscription'),
          manageBilling: t('manageBilling'),
          openingPortal: t('openingPortal'),
          portalError: t('portalError'),
          providerStale: t('providerStale')
        }}
      />

      <section className="mt-6" aria-labelledby="billing-plans-title">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="billing-plans-title" className="text-base font-semibold">
              {t('plansTitle')}
            </h2>
          </div>
          <div className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <ShieldCheck
              className="h-3.5 w-3.5 text-primary"
              aria-hidden="true"
            />
            {t('secureCheckout')}
          </div>
        </div>

        <div className="billing-plan-grid grid gap-3 md:grid-cols-2 2xl:grid-cols-4">
          {plans.map((plan, index) => {
            const isCurrent = currentPlan === plan.id
            const paidPlanId = isPaidBillingPlanId(plan.id) ? plan.id : null
            const canUpgrade =
              paidPlanId !== null &&
              canStartPlanCheckout(currentPlan, paidPlanId)
            const configured =
              paidPlanId !== null && Boolean(planCatalog?.[paidPlanId])
            const canOpenPortal = Boolean(
              hasSubscription && user.hasBillingProfile
            )
            const actionLabel = isCurrent
              ? t('currentPlan')
              : canOpenPortal
                ? t('managePlan')
                : !canUpgrade
                  ? t('lowerTier')
                  : configured
                    ? t('upgrade')
                    : t('unavailable')

            return (
              <Card
                as="article"
                key={plan.id}
                className={`block gap-0 py-0 relative flex h-full flex-col p-4 transition-all animate-slide-up ${
                  isCurrent
                    ? 'border-primary/40 bg-primary/[0.035]'
                    : plan.highlighted
                      ? 'border-primary/60 ring-2 ring-primary/15 shadow-primary/10'
                      : ''
                }`}
                style={{ animationDelay: `${index * 60}ms` }}
                aria-labelledby={`plan-${plan.id}`}
              >
                <div className="mb-3 flex items-start justify-between gap-3">
                  <h3
                    id={`plan-${plan.id}`}
                    className="text-base font-semibold text-foreground"
                  >
                    {plan.name}
                  </h3>
                  {(isCurrent || plan.highlighted) && (
                    <span className="whitespace-nowrap rounded-sm bg-primary/10 px-2 py-1 text-[9px] font-semibold text-primary">
                      {isCurrent ? t('currentPlan') : t('mostPopular')}
                    </span>
                  )}
                </div>

                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-semibold">{plan.price}</span>
                  <span className="text-xs text-muted-foreground">
                    {plan.period}
                  </span>
                </div>
                <p className="mt-2 text-xs font-semibold text-primary">
                  {plan.credits}
                </p>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  {plan.description}
                </p>

                <ul className="my-3 flex-1 space-y-1.5 border-t border-border/70 pt-3">
                  {plan.features.map((feature) => (
                    <li
                      key={feature}
                      className="flex items-start gap-2 text-[12px] leading-relaxed text-muted-foreground"
                    >
                      <Check
                        className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary"
                        aria-hidden="true"
                      />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                {isCurrent || (!canUpgrade && !canOpenPortal) ? (
                  <button
                    type="button"
                    disabled={true}
                    className="flex h-9 w-full items-center justify-center rounded-md border border-border bg-card px-3 text-xs font-semibold text-foreground opacity-65"
                  >
                    {actionLabel}
                  </button>
                ) : canOpenPortal ? (
                  <PortalButton
                    locale={locale}
                    label={actionLabel}
                    loadingLabel={t('openingPortal')}
                    errorLabel={t('portalError')}
                    className="flex h-9 w-full items-center justify-center gap-2 rounded-md border border-border bg-card px-3 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
                  />
                ) : paidPlanId ? (
                  <CheckoutButton
                    planId={paidPlanId}
                    locale={locale}
                    label={actionLabel}
                    loadingLabel={t('openingCheckout')}
                    errorLabel={t('checkoutError')}
                    disabled={!configured}
                    emphasized={Boolean(plan.highlighted)}
                  />
                ) : null}
              </Card>
            )
          })}
        </div>
      </section>

      <InvoiceHistory
        invoices={data.invoices}
        locale={locale}
        providerAvailable={providerAvailable}
        hasBillingProfile={hasBillingData}
        labels={{
          title: t('invoicesTitle'),
          tableCaption: t('invoicesTableCaption'),
          number: t('invoiceNumber'),
          date: t('invoiceDate'),
          status: t('invoiceStatus'),
          amount: t('invoiceAmount'),
          actions: t('invoiceActions'),
          viewInvoice: t('viewInvoice'),
          downloadPdf: t('downloadPdf'),
          noInvoicesTitle: t('noInvoicesTitle'),
          noInvoicesDescription: t('noInvoicesDesc'),
          providerUnavailableTitle: t('providerUnavailableTitle'),
          providerUnavailableDescription: t('providerUnavailableDesc'),
          retry: t('retry'),
          statuses: {
            draft: t('invoiceStatuses.draft'),
            open: t('invoiceStatuses.open'),
            paid: t('invoiceStatuses.paid'),
            uncollectible: t('invoiceStatuses.uncollectible'),
            void: t('invoiceStatuses.void'),
            unknown: t('invoiceStatuses.unknown')
          }
        }}
      />
    </div>
  )
}
