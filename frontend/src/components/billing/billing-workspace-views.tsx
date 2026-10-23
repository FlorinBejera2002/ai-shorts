import { BillingGuide } from './billing-guide'
import { BillingNotices } from './billing-notices'
import { BillingSummary } from './billing-summary'
import { BillingTestModeNotice } from './billing-test-mode-notice'
import { InvoiceHistory } from './invoice-history'
import { PlanSelector } from './plan-selector'
import type { useBillingResource } from './use-billing-resource'
import { Button } from '@/components/ui/button'
import { LoadingIndicator } from '@/components/ui/loading-indicator'
import {
  isPaidBillingPlanId,
  isTerminalSubscriptionStatus,
  needsSubscriptionConfirmation,
  normalizeBillingPlan,
  type BillingLocale
} from '@/lib/billing'
import type { BillingData, PlanCatalog } from '@/types/api'
import { RefreshCw } from 'lucide-react'
import { useTranslations } from 'next-intl'
import styles from './billing-page.module.css'

export type BillingView = 'overview' | 'plans' | 'invoices' | 'details'
type Props = {
  data: BillingData
  resource: ReturnType<typeof useBillingResource>
  locale: BillingLocale
  unlimited: boolean
  view: BillingView
  planCatalog: PlanCatalog | undefined
  canceled: boolean
  onNavigate: (view: BillingView) => void
}
const STATUS_KEYS = {
  active: 'active',
  trialing: 'trialing',
  past_due: 'pastDue',
  unpaid: 'unpaid',
  incomplete: 'incomplete',
  incomplete_expired: 'incompleteExpired',
  canceled: 'canceled',
  paused: 'paused',
  unknown: 'unknown'
} as const

function billingSnapshot(data: BillingData, unlimited: boolean) {
  const currentPlan = normalizeBillingPlan(data.account.plan)
  return {
    currentPlan,
    hasSubscription: Boolean(
      data.subscription &&
        !isTerminalSubscriptionStatus(data.subscription.status)
    ),
    hasBillingData:
      data.account.hasBillingProfile || Boolean(data.subscription),
    needsConfirmation: needsSubscriptionConfirmation(
      currentPlan,
      data.subscription,
      data.account.hasBillingProfile,
      unlimited
    ),
    statusKey:
      STATUS_KEYS[data.subscription?.status as keyof typeof STATUS_KEYS] ??
      'unknown',
    confirmingCheckout:
      data.checkoutVerification?.status === 'pending' ||
      data.checkoutVerification?.status === 'unavailable'
  }
}

function ConfirmationRefresh({ resource }: Pick<Props, 'resource'>) {
  const t = useTranslations('billing')
  return (
    <Button
      className={styles.refreshAction}
      onClick={() => void resource.reload()}
      disabled={resource.recovering}
      aria-busy={resource.recovering}
    >
      {resource.recovering ? (
        <LoadingIndicator />
      ) : (
        <RefreshCw aria-hidden="true" />
      )}
      {t('refreshBilling')}
    </Button>
  )
}

function OverviewSummary({
  data,
  resource,
  locale,
  unlimited,
  view,
  planCatalog,
  onNavigate,
  snapshot
}: Props & { snapshot: ReturnType<typeof billingSnapshot> }) {
  const t = useTranslations('billing')
  const {
    currentPlan,
    hasBillingData,
    needsConfirmation,
    statusKey,
    confirmingCheckout
  } = snapshot
  return (
    <BillingSummary
      credits={data.account.credits}
      creditsUnlimited={unlimited}
      currentPlan={currentPlan}
      planName={unlimited ? t('adminPlan') : t(currentPlan)}
      planPrice={
        isPaidBillingPlanId(currentPlan)
          ? planCatalog?.[currentPlan]
          : undefined
      }
      locale={locale}
      subscription={data.subscription}
      statusLabel={t(`statuses.${statusKey}`)}
      hasBillingData={hasBillingData}
      canManageBilling={data.account.hasBillingProfile}
      providerAvailable={data.providerAvailable}
      subscriptionNeedsConfirmation={needsConfirmation}
      noticesInBanner
      presentation={view === 'details' ? 'details' : 'overview'}
      canChangePlan={
        !unlimited &&
        !(snapshot.hasSubscription && data.subscription?.cancelAtPeriodEnd) &&
        !confirmingCheckout
      }
      onChoosePlan={() => onNavigate('plans')}
      actionSlot={
        confirmingCheckout ? (
          <ConfirmationRefresh resource={resource} />
        ) : undefined
      }
    />
  )
}

export function BillingWorkspaceViews(props: Props) {
  const {
    data,
    resource,
    locale,
    unlimited,
    view,
    planCatalog,
    onNavigate,
    canceled
  } = props
  const t = useTranslations('billing')
  const snapshot = billingSnapshot(data, unlimited)
  return (
    <>
      {data.mode === 'test' && (
        <BillingTestModeNotice
          title={t('testModeTitle')}
          description={t('testModeDescription')}
        />
      )}
      <div className={styles.view} hidden={view !== 'overview'}>
        <BillingNotices
          data={data}
          locale={locale}
          canceled={canceled}
          confirmationDelayed={resource.confirmationDelayed}
          subscriptionNeedsConfirmation={snapshot.needsConfirmation}
          recoveryFailed={resource.recoveryFailed}
        />
      </div>
      <div
        className={styles.view}
        hidden={view !== 'overview' && view !== 'details'}
      >
        <OverviewSummary {...props} snapshot={snapshot} />
      </div>
      <div className={styles.view} hidden={view !== 'plans' || unlimited}>
        <PlanSelector
          currentPlan={snapshot.currentPlan}
          hasSubscription={snapshot.hasSubscription}
          hasBillingProfile={data.account.hasBillingProfile}
          planCatalog={planCatalog}
          locale={locale}
          onCancel={() => onNavigate('overview')}
        />
      </div>
      <div
        className={styles.view}
        hidden={view !== 'overview' && view !== 'invoices'}
      >
        <InvoiceHistory
          invoices={data.invoices}
          locale={locale}
          providerAvailable={data.providerAvailable}
          hasBillingProfile={snapshot.hasBillingData}
          compact={view !== 'invoices'}
          showTitle={view !== 'invoices'}
          onViewAll={() => onNavigate('invoices')}
          onRetry={() => void resource.reload()}
          retrying={resource.recovering}
        />
      </div>
      <div
        className={styles.view}
        hidden={view !== 'overview' && view !== 'details'}
      >
        <BillingGuide
          expanded={view === 'details'}
          onOpenDetails={() => onNavigate('details')}
        />
      </div>
    </>
  )
}
