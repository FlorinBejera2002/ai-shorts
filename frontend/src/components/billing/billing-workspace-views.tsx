import { LoadingIndicator } from '@/components/ui/loading-indicator'
import { isPaidBillingPlanId, type BillingLocale } from '@/lib/billing'
import type { BillingData, PlanCatalog } from '@/types/api'
import { RotateCw } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { BillingDetails, BillingDetailsLinks } from './billing-details'
import { BillingNotices } from './billing-notices'
import { billingOverview, type BillingOverview } from './billing-overview'
import { BillingSummary } from './billing-summary'
import { HostedBillingButton } from './hosted-billing-button'
import { InvoiceHistory } from './invoice-history'
import { PlanSelector } from './plan-selector'
import type { useBillingResource } from './use-billing-resource'
import ui from './billing-ui.module.css'
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

/** Summary actions in canvas order: change plan (primary) first, then the billing portal. */
function SummaryActions({
  overview,
  resource,
  locale,
  onChoosePlan
}: {
  overview: BillingOverview
  resource: Props['resource']
  locale: BillingLocale
  onChoosePlan: () => void
}) {
  const t = useTranslations('billing')
  return (
    <>
      {overview.confirmingCheckout && (
        <button
          type="button"
          className={`${ui.button} ${ui.primary}`}
          onClick={() => void resource.reload()}
          disabled={resource.recovering}
          aria-busy={resource.recovering}
          data-billing-confirm-refresh=""
        >
          {resource.recovering ? <LoadingIndicator /> : <RotateCw aria-hidden="true" />}
          {t('refreshBilling')}
        </button>
      )}
      {overview.canChangePlan && (
        <button type="button" className={`${ui.button} ${ui.primary}`} onClick={onChoosePlan} data-billing-choose-plan="">
          {t(overview.access === 'free' ? 'summaryDesign.choosePlan' : 'summaryDesign.changePlan')}
        </button>
      )}
      {overview.canManageBilling && (
        <HostedBillingButton
          locale={locale}
          label={t('manageBilling')}
          loadingLabel={t('openingPortal')}
          errorLabel={t('portalError')}
          variant={overview.canChangePlan || overview.confirmingCheckout ? 'secondary' : 'primary'}
        />
      )}
    </>
  )
}

export function BillingWorkspaceViews({
  data,
  resource,
  locale,
  unlimited,
  view,
  planCatalog,
  canceled,
  onNavigate
}: Props) {
  const t = useTranslations('billing')
  const overview = billingOverview(data, unlimited)
  const { currentPlan } = overview
  const invoices = (variant: 'recent' | 'full') => (
    <InvoiceHistory
      invoices={data.invoices}
      locale={locale}
      providerAvailable={data.providerAvailable}
      variant={variant}
      onViewAll={() => onNavigate('invoices')}
      onRetry={() => void resource.reload()}
      retrying={resource.recovering}
    />
  )
  if (view === 'plans' && !unlimited)
    return (
      <PlanSelector
        currentPlan={currentPlan}
        changesInPortal={overview.hasSubscription && data.account.hasBillingProfile}
        planCatalog={planCatalog}
        locale={locale}
        onCancel={() => onNavigate('overview')}
      />
    )
  if (view === 'invoices') return invoices('full')
  if (view === 'details') return <BillingDetails locale={locale} canManageBilling={overview.canManageBilling} />
  return (
    <>
      <BillingNotices
        data={data}
        locale={locale}
        canceled={canceled}
        confirmationDelayed={resource.confirmationDelayed}
        subscriptionNeedsConfirmation={overview.needsConfirmation}
        recoveryFailed={resource.recoveryFailed}
      />
      <BillingSummary
        overview={overview}
        planName={unlimited ? t('adminPlan') : t(currentPlan)}
        planPrice={isPaidBillingPlanId(currentPlan) ? planCatalog?.[currentPlan] : undefined}
        locale={locale}
        actions={
          <SummaryActions
            overview={overview}
            resource={resource}
            locale={locale}
            onChoosePlan={() => onNavigate('plans')}
          />
        }
      />
      <div className={styles.overviewRow}>
        {invoices('recent')}
        <BillingDetailsLinks onOpen={() => onNavigate('details')} />
      </div>
    </>
  )
}
