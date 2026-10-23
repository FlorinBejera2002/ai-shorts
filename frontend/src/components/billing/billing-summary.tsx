'use client'

import { CalendarDays, Coins, FileVideo, Package } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'
import { PortalButton } from '@/components/billing/portal-button'
import { Button } from '@/components/ui/button'
import {
  type BillingLocale,
  type BillingPlanId,
  type BillingSubscription,
  CREDITS_PER_CLIP,
  INITIAL_FREE_CREDITS,
  PLAN_CREDITS,
  estimateAvailableClips,
  isPaidBillingPlanId,
  subscriptionPeriodKind
} from '@/lib/billing'
import type { BillingPlanPrice } from '@/types/api'
import styles from './billing-summary.module.css'

type BillingSummaryLabels = {
  overview: string
  currentPlan: string
  creditsAvailable: string
  clipRunwayValue: (values: { count: number }) => string
  renewsOn: string
  endsOn: string
  periodEndsOn: string
  subscriptionEnded: string
  cancellationScheduled: string
  paymentNeedsAttention: string
  subscriptionPaused: string
  coverageUnconfirmed: string
  coverageUnconfirmedHint: string
  lastConfirmedPeriod: string
  noActiveSubscription: string
  manageBilling: string
  openingPortal: string
  portalError: string
  providerStale: string
  creditsUnlimited: string
  adminAccess: string
}

type BillingSummaryProps = {
  credits: number
  creditsUnlimited?: boolean
  planName: string
  currentPlan?: BillingPlanId
  planPrice?: BillingPlanPrice
  financialPlanName?: string
  locale: BillingLocale
  subscription: BillingSubscription | null
  statusLabel: string
  hasBillingData: boolean
  canManageBilling: boolean
  canChangePlan?: boolean
  onChoosePlan?: () => void
  actionSlot?: ReactNode
  presentation?: 'overview' | 'details'
  noticesInBanner?: boolean
  providerAvailable: boolean
  subscriptionNeedsConfirmation: boolean
  labels?: BillingSummaryLabels
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

function formatPrice(price: BillingPlanPrice, locale: BillingLocale) {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: price.currency,
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: price.amount % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2
  }).format(price.amount / 100)
}

function statusClass(status: string, needsConfirmation: boolean) {
  if (needsConfirmation) return styles.neutralStatus
  if (status === 'active' || status === 'trialing') return styles.activeStatus
  if (['past_due', 'unpaid', 'incomplete'].includes(status))
    return styles.warningStatus
  return styles.neutralStatus
}

function SubscriptionNotices({
  subscription,
  needsConfirmation,
  labels
}: {
  subscription: BillingSubscription | null
  needsConfirmation: boolean
  labels: BillingSummaryLabels
}) {
  if (needsConfirmation) {
    return (
      <p className={styles.notice} role="status">
        {labels.coverageUnconfirmedHint}
      </p>
    )
  }
  if (!subscription) return null
  const kind = subscriptionPeriodKind(subscription)
  const needsPayment = ['past_due', 'unpaid', 'incomplete'].includes(
    subscription.status
  )
  return (
    <div className={styles.notices}>
      {kind === 'ends' && <p>{labels.cancellationScheduled}</p>}
      {kind === 'none' && <p>{labels.subscriptionEnded}</p>}
      {needsPayment && (
        <p className={styles.paymentNotice} role="status">
          {labels.paymentNeedsAttention}
        </p>
      )}
      {subscription.status === 'paused' && <p>{labels.subscriptionPaused}</p>}
    </div>
  )
}

function PlanMetadata({
  currentPlan,
  subscription,
  locale,
  needsConfirmation,
  creditsUnlimited,
  labels
}: {
  currentPlan: BillingPlanId
  subscription: BillingSubscription | null
  locale: BillingLocale
  needsConfirmation: boolean
  creditsUnlimited: boolean
  labels: BillingSummaryLabels
}) {
  const t = useTranslations('billing.summaryDesign')
  const date = formatPeriodDate(subscription?.currentPeriodEnd ?? null, locale)
  const kind = subscriptionPeriodKind(subscription)
  const periodLabel = {
    ends: labels.endsOn,
    renews: labels.renewsOn,
    period: labels.periodEndsOn,
    none: labels.periodEndsOn
  }[kind]
  const hasPeriod = Boolean(date && (needsConfirmation || kind !== 'none'))
  if (creditsUnlimited) {
    return <p className={styles.adminAccess}>{labels.adminAccess}</p>
  }
  return (
    <div className={styles.metadata}>
      {isPaidBillingPlanId(currentPlan) && !needsConfirmation && (
        <div className={styles.metadataItem}>
          <Coins aria-hidden="true" />
          <p>
            <strong>{PLAN_CREDITS[currentPlan].toLocaleString(locale)}</strong>{' '}
            {t('creditsPerMonth')}
          </p>
        </div>
      )}
      {hasPeriod ? (
        <div className={styles.metadataItem}>
          <CalendarDays aria-hidden="true" />
          <p>
            {needsConfirmation ? labels.lastConfirmedPeriod : periodLabel}{' '}
            <span>{date}</span>
          </p>
        </div>
      ) : (
        <div className={styles.metadataItem}>
          <Package aria-hidden="true" />
          <p>
            {needsConfirmation
              ? labels.coverageUnconfirmed
              : labels.noActiveSubscription}
          </p>
        </div>
      )}
      {currentPlan === 'free' && !subscription && !needsConfirmation && (
        <>
          <div className={styles.metadataItem}>
            <Coins aria-hidden="true" />
            <p>
              {t('welcomeCredits', {
                credits: INITIAL_FREE_CREDITS.toLocaleString(locale)
              })}
            </p>
          </div>
          <div className={styles.metadataItem}>
            <FileVideo aria-hidden="true" />
            <p>{t('freeLimits')}</p>
          </div>
        </>
      )}
    </div>
  )
}

function SummaryActions({
  locale,
  labels,
  canManageBilling,
  canChangePlan,
  onChoosePlan,
  actionSlot
}: Pick<
  BillingSummaryProps,
  | 'locale'
  | 'labels'
  | 'canManageBilling'
  | 'canChangePlan'
  | 'onChoosePlan'
  | 'actionSlot'
> & { labels: BillingSummaryLabels }) {
  const t = useTranslations('billing.summaryDesign')
  if (!canManageBilling && !onChoosePlan && !actionSlot) return null
  return (
    <div className={styles.actions} data-billing-summary-actions>
      {actionSlot}
      {canManageBilling && (
        <PortalButton
          locale={locale}
          label={labels.manageBilling}
          loadingLabel={labels.openingPortal}
          errorLabel={labels.portalError}
          emphasized={!actionSlot}
          className={styles.action}
        />
      )}
      {onChoosePlan && canChangePlan && (
        <Button
          type="button"
          variant={canManageBilling || actionSlot ? 'outline' : 'default'}
          className={styles.action}
          onClick={onChoosePlan}
          data-billing-choose-plan
        >
          {t(canManageBilling ? 'changePlan' : 'choosePlan')}
        </Button>
      )}
    </div>
  )
}

function useSummaryLabels(
  providedLabels?: BillingSummaryLabels
): BillingSummaryLabels {
  const billing = useTranslations('billing')
  return (
    providedLabels ?? {
      overview: billing('overviewTitle'),
      currentPlan: billing('currentPlan'),
      creditsAvailable: billing('creditsAvailable'),
      clipRunwayValue: ({ count }) => billing('clipRunwayValue', { count }),
      renewsOn: billing('renewsOn'),
      endsOn: billing('endsOn'),
      periodEndsOn: billing('periodEndsOn'),
      subscriptionEnded: billing('subscriptionEnded'),
      cancellationScheduled: billing('cancellationScheduled'),
      paymentNeedsAttention: billing('paymentNeedsAttention'),
      subscriptionPaused: billing('subscriptionPaused'),
      coverageUnconfirmed: billing('coverageUnconfirmed'),
      coverageUnconfirmedHint: billing('coverageUnconfirmedHint'),
      lastConfirmedPeriod: billing('lastConfirmedPeriod'),
      noActiveSubscription: billing('noActiveSubscription'),
      manageBilling: billing('manageBilling'),
      openingPortal: billing('openingPortal'),
      portalError: billing('portalError'),
      providerStale: billing('providerStale'),
      creditsUnlimited: billing('creditsUnlimited'),
      adminAccess: billing('adminAccess')
    }
  )
}

type SummaryPlanProps = {
  currentPlan: BillingPlanId
  creditsUnlimited: boolean
  needsConfirmation: boolean
  planName: string
  planPrice?: BillingPlanPrice
  financialPlanName?: string
  statusLabel: string
  subscription: BillingSubscription | null
  labels: BillingSummaryLabels
  locale: BillingLocale
}

function SummarySubscriptionStatus({
  subscription,
  needsConfirmation,
  financial = false,
  label
}: {
  subscription: BillingSubscription | null
  needsConfirmation: boolean
  financial?: boolean
  label: string
}) {
  const t = useTranslations('billing.summaryDesign')
  const scheduled =
    !financial &&
    !needsConfirmation &&
    subscription?.cancelAtPeriodEnd &&
    subscriptionPeriodKind(subscription) === 'ends'
  const color = scheduled
    ? styles.neutralStatus
    : statusClass(subscription?.status ?? '', needsConfirmation)
  return (
    <span className={`${styles.status} ${color}`} data-billing-status>
      {scheduled ? t('cancellationScheduled') : label}
    </span>
  )
}

function SummaryPlan({
  currentPlan,
  creditsUnlimited,
  needsConfirmation,
  planName,
  planPrice,
  financialPlanName,
  subscription,
  statusLabel,
  labels,
  locale
}: SummaryPlanProps) {
  const t = useTranslations('billing.summaryDesign')
  const financialStatus = currentPlan === 'free' && Boolean(subscription)
  const status = needsConfirmation ? labels.coverageUnconfirmed : statusLabel
  const showStatus =
    (Boolean(subscription) || needsConfirmation) && !creditsUnlimited
  return (
    <div className={styles.plan}>
      <h2 id="billing-overview-title" className={styles.label}>
        {financialStatus && !creditsUnlimited
          ? t('currentAccess')
          : labels.currentPlan}
      </h2>
      <div className={styles.planHeading}>
        <p className={styles.planName} data-billing-effective-plan>
          {planName}
        </p>
        {showStatus && !financialStatus && (
          <SummarySubscriptionStatus
            subscription={subscription}
            needsConfirmation={needsConfirmation}
            label={status}
          />
        )}
      </div>
      {showStatus && financialStatus && (
        <div className={styles.financialStatus}>
          <span>
            {financialPlanName
              ? t('subscription', { plan: financialPlanName })
              : t('financialStatus')}
          </span>
          <SummarySubscriptionStatus
            subscription={subscription}
            needsConfirmation={needsConfirmation}
            financial
            label={status}
          />
        </div>
      )}
      {planPrice && !creditsUnlimited && (
        <p className={styles.price}>
          <strong>{formatPrice(planPrice, locale)}</strong>{' '}
          <span>{t('perMonth')}</span>
        </p>
      )}
      <PlanMetadata
        currentPlan={currentPlan}
        subscription={subscription}
        locale={locale}
        needsConfirmation={needsConfirmation}
        creditsUnlimited={creditsUnlimited}
        labels={labels}
      />
    </div>
  )
}

function SummaryCredits({
  credits,
  creditsUnlimited,
  locale,
  labels
}: {
  credits: number
  creditsUnlimited: boolean
  locale: BillingLocale
  labels: BillingSummaryLabels
}) {
  const t = useTranslations('billing.summaryDesign')
  return (
    <div className={styles.credits}>
      <h2 className={styles.label}>{labels.creditsAvailable}</h2>
      <p className={styles.balance} data-billing-credit-balance>
        {creditsUnlimited ? '∞' : credits.toLocaleString(locale)}
      </p>
      <p className={styles.runway}>
        {creditsUnlimited
          ? labels.creditsUnlimited
          : t('availableClips', { count: estimateAvailableClips(credits) })}
      </p>
      {!creditsUnlimited && (
        <p className={styles.creditRate}>
          {t('creditsPerClip', { count: CREDITS_PER_CLIP })}
        </p>
      )}
    </div>
  )
}

export function BillingSummary({
  credits,
  creditsUnlimited = false,
  planName,
  currentPlan = 'free',
  planPrice,
  financialPlanName,
  locale,
  subscription,
  statusLabel,
  hasBillingData,
  canManageBilling,
  canChangePlan = true,
  onChoosePlan,
  actionSlot,
  presentation = 'overview',
  noticesInBanner = false,
  providerAvailable,
  subscriptionNeedsConfirmation,
  labels: providedLabels
}: BillingSummaryProps) {
  const labels = useSummaryLabels(providedLabels)
  return (
    <section
      className={styles.summary}
      aria-labelledby="billing-overview-title"
      data-billing-summary
      data-presentation={presentation}
    >
      <SummaryPlan
        currentPlan={currentPlan}
        creditsUnlimited={creditsUnlimited}
        needsConfirmation={subscriptionNeedsConfirmation}
        planName={planName}
        planPrice={planPrice}
        financialPlanName={financialPlanName}
        subscription={subscription}
        statusLabel={statusLabel}
        labels={labels}
        locale={locale}
      />
      <SummaryActions
        locale={locale}
        labels={labels}
        canManageBilling={canManageBilling}
        canChangePlan={!creditsUnlimited && canChangePlan}
        onChoosePlan={onChoosePlan}
        actionSlot={actionSlot}
      />
      <SummaryCredits
        credits={credits}
        creditsUnlimited={creditsUnlimited}
        locale={locale}
        labels={labels}
      />
      {!noticesInBanner && (
        <SubscriptionNotices
          subscription={subscription}
          needsConfirmation={subscriptionNeedsConfirmation}
          labels={labels}
        />
      )}
      {!providerAvailable && hasBillingData && !noticesInBanner && (
        <p className={styles.notice}>{labels.providerStale}</p>
      )}
    </section>
  )
}
