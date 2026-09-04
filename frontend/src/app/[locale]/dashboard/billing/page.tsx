import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Info,
  LoaderCircle,
  ShieldCheck
} from 'lucide-react'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { redirect } from 'next/navigation'

import { BillingSummary } from '@/components/billing/billing-summary'
import { CheckoutButton } from '@/components/billing/checkout-button'
import { InvoiceHistory } from '@/components/billing/invoice-history'
import { PortalButton } from '@/components/billing/portal-button'
import { PageHeader } from '@/components/ui/page-header'
import { auth } from '@/lib/auth'
import {
  type BillingPlanId,
  type BillingProviderState,
  type BillingSubscription,
  type CheckoutVerification,
  INITIAL_FREE_CREDITS,
  PLAN_CREDITS,
  canStartPlanCheckout,
  isPaidBillingPlanId,
  isTerminalSubscriptionStatus,
  normalizeBillingLocale,
  normalizeBillingPlan
} from '@/lib/billing'
import { getPrisma } from '@/lib/db'
import {
  type BillingPlanPrice,
  loadBillingPlanCatalog,
  loadBillingProviderState,
  verifyCheckoutSession
} from '@/lib/stripe'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type PageSearchParams = Record<string, string | string[] | undefined>

type Plan = {
  id: BillingPlanId
  name: string
  price: string
  period: string
  credits: string
  features: string[]
  highlighted?: boolean
}

function firstSearchValue(value: string | string[] | undefined): string | null {
  return typeof value === 'string' ? value : null
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

export default async function BillingPage({
  params,
  searchParams
}: {
  params: Promise<{ locale: string }>
  searchParams: Promise<PageSearchParams>
}) {
  const [{ locale: rawLocale }, query] = await Promise.all([
    params,
    searchParams
  ])
  setRequestLocale(rawLocale)
  const locale = normalizeBillingLocale(rawLocale)
  const t = await getTranslations('billing')

  const session = await auth()
  if (!session?.user?.id) {
    redirect(locale === 'ro' ? '/ro/login' : '/login')
  }
  const prisma = getPrisma()

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      credits: true,
      plan: true,
      stripeCustomerId: true,
      stripeSubscriptionId: true,
      stripeSubscriptionStatus: true,
      stripeCurrentPeriodEnd: true,
      stripeCancelAtPeriodEnd: true
    }
  })
  if (!user) redirect(locale === 'ro' ? '/ro/login' : '/login')

  const persistedSubscription: BillingSubscription | null =
    user.stripeSubscriptionId
      ? {
          status: user.stripeSubscriptionStatus ?? 'unknown',
          cancelAtPeriodEnd: user.stripeCancelAtPeriodEnd,
          currentPeriodEnd: user.stripeCurrentPeriodEnd?.toISOString() ?? null
        }
      : null

  let providerState: BillingProviderState | null = null
  let providerAvailable = true
  if (user.stripeCustomerId) {
    try {
      providerState = await loadBillingProviderState({
        customerId: user.stripeCustomerId,
        subscriptionId: user.stripeSubscriptionId
      })
    } catch {
      providerAvailable = false
    }
  } else if (user.stripeSubscriptionId) {
    providerAvailable = false
  }

  let planCatalog: Awaited<ReturnType<typeof loadBillingPlanCatalog>> | null =
    null
  try {
    planCatalog = await loadBillingPlanCatalog()
  } catch {
    // Never advertise or charge an amount that could not be verified against
    // the configured Stripe Price objects.
  }

  const checkoutSessionId = firstSearchValue(query.checkout_session_id)
  let checkoutVerification:
    | CheckoutVerification
    | { status: 'unavailable' }
    | null = null
  if (query.checkout_session_id !== undefined) {
    if (!checkoutSessionId) {
      checkoutVerification = { status: 'invalid', planId: null }
    } else {
      try {
        checkoutVerification = await verifyCheckoutSession({
          checkoutSessionId,
          userId: session.user.id,
          expectedCustomerId: user.stripeCustomerId,
          expectedSubscriptionId: user.stripeSubscriptionId
        })
      } catch {
        checkoutVerification = { status: 'unavailable' }
      }
    }
  }

  const plans: Plan[] = [
    {
      id: 'free',
      name: t('free'),
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
      price: formatPlanPrice(planCatalog?.agency, locale, t('unavailable')),
      period: t('periodMonth'),
      credits: t('creditsMonthly', { credits: PLAN_CREDITS.agency }),
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
  const subscription = providerState?.subscription ?? persistedSubscription
  const hasSubscription = Boolean(
    subscription && !isTerminalSubscriptionStatus(subscription.status)
  )
  const hasBillingData = Boolean(
    user.stripeCustomerId || user.stripeSubscriptionId
  )
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
    <div className="animate-fade-in">
      <PageHeader title={t('title')} description={t('desc')} />

      {checkoutVerification?.status === 'complete' && (
        <div
          className="mt-6 flex items-start gap-3 rounded-xl border border-success/25 bg-success/10 px-4 py-3 text-success"
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
          className="mt-6 flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-foreground"
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
          className="mt-6 flex items-start gap-3 rounded-xl border border-destructive/25 bg-destructive/10 px-4 py-3 text-destructive"
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
          className="mt-6 flex items-start gap-3 rounded-xl border border-warning/25 bg-warning/10 px-4 py-3 text-warning"
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
          className="mt-6 flex items-start gap-3 rounded-xl border border-warning/25 bg-warning/10 px-4 py-3 text-warning"
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
        canManageBilling={Boolean(user.stripeCustomerId)}
        providerAvailable={providerAvailable}
        labels={{
          overview: t('overviewTitle'),
          creditsAvailable: t('creditsAvailable'),
          plan: t('planLabel'),
          subscriptionStatus: t('subscriptionStatus'),
          renewsOn: t('renewsOn'),
          endsOn: t('endsOn'),
          noActiveSubscription: t('noActiveSubscription'),
          manageBilling: t('manageBilling'),
          openingPortal: t('openingPortal'),
          portalError: t('portalError'),
          providerStale: t('providerStale')
        }}
      />

      <section className="mt-10" aria-labelledby="billing-plans-title">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="billing-plans-title" className="text-lg font-semibold">
              {t('plansTitle')}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t('plansDesc')}
            </p>
          </div>
          <div className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <ShieldCheck
              className="h-3.5 w-3.5 text-primary"
              aria-hidden="true"
            />
            {t('secureCheckout')}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {plans.map((plan, index) => {
            const isCurrent = currentPlan === plan.id
            const paidPlanId = isPaidBillingPlanId(plan.id) ? plan.id : null
            const canUpgrade =
              paidPlanId !== null &&
              canStartPlanCheckout(currentPlan, paidPlanId)
            const configured =
              paidPlanId !== null && Boolean(planCatalog?.[paidPlanId])
            const canOpenPortal = Boolean(
              hasSubscription && user.stripeCustomerId
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
              <article
                key={plan.id}
                className={`panel relative flex h-full flex-col p-5 transition-all animate-slide-up ${
                  isCurrent
                    ? 'border-primary/40 bg-primary/[0.035]'
                    : plan.highlighted
                      ? 'border-primary/60 ring-2 ring-primary/15 shadow-primary/10'
                      : ''
                }`}
                style={{ animationDelay: `${index * 60}ms` }}
                aria-labelledby={`plan-${plan.id}`}
              >
                {isCurrent ? (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-primary px-3 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary-foreground">
                    {t('currentPlan')}
                  </div>
                ) : (
                  plan.highlighted && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-primary px-3 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary-foreground">
                      {t('mostPopular')}
                    </div>
                  )
                )}

                <div className="mb-4 flex items-baseline gap-1">
                  <span className="text-3xl font-bold">{plan.price}</span>
                  <span className="text-xs text-muted-foreground">
                    {plan.period}
                  </span>
                </div>
                <h3
                  id={`plan-${plan.id}`}
                  className="text-sm font-semibold text-foreground"
                >
                  {plan.name}
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  {plan.credits}
                </p>

                <ul className="my-5 flex-1 space-y-2 border-t border-border pt-5">
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
                    className="flex min-h-11 w-full items-center justify-center rounded-lg border border-border bg-card px-3 text-[13px] font-semibold text-foreground opacity-65"
                  >
                    {actionLabel}
                  </button>
                ) : canOpenPortal ? (
                  <PortalButton
                    locale={locale}
                    label={actionLabel}
                    loadingLabel={t('openingPortal')}
                    errorLabel={t('portalError')}
                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-card px-3 text-[13px] font-semibold text-foreground transition-all hover:border-primary/35 hover:bg-primary/5 hover:text-primary"
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
              </article>
            )
          })}
        </div>
      </section>

      <InvoiceHistory
        invoices={providerState?.invoices ?? []}
        locale={locale}
        providerAvailable={providerAvailable}
        hasBillingProfile={hasBillingData}
        labels={{
          title: t('invoicesTitle'),
          description: t('invoicesDesc'),
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
