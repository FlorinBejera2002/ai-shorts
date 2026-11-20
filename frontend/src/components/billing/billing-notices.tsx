import { LoadingIndicator } from '@/components/ui/loading-indicator'
import type { BillingLocale } from '@/lib/billing'
import { subscriptionPeriodKind } from '@/lib/billing'
import type { BillingData } from '@/types/api'
import { Info, TriangleAlert } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { formatBillingDate } from './billing-format'
import { needsPaymentAttention } from './billing-overview'
import styles from './billing-page.module.css'

type Tone = 'info' | 'warning'
type Props = {
  data: BillingData
  locale: BillingLocale
  confirmationDelayed: boolean
  subscriptionNeedsConfirmation: boolean
}

const ICONS = { info: Info, warning: TriangleAlert }

function Notice({
  kind,
  title,
  description,
  tone = 'info',
  loading = false
}: {
  kind: string
  title: string
  description?: string
  tone?: Tone
  loading?: boolean
}) {
  const Icon = ICONS[tone]
  return (
    <div
      className={styles.notice}
      data-billing-notice={kind}
      data-tone={tone}
      role="status"
    >
      {loading ? <LoadingIndicator className={styles.noticeIcon} /> : <Icon className={styles.noticeIcon} aria-hidden="true" />}
      <span className={styles.noticeCopy}>
        <b>{title}</b>
        {description && <span>{description}</span>}
      </span>
    </div>
  )
}

/** Only a checkout still confirming stays on the page; the outcome of a return is announced as a toast. */
function CheckoutNotice({ data, confirmationDelayed }: Pick<Props, 'data' | 'confirmationDelayed'>) {
  const t = useTranslations('billing')
  if (data.checkoutVerification?.status !== 'pending') return null
  return confirmationDelayed ? (
    <Notice kind="delayed" title={t('workspaceDesign.delayedTitle')} description={t('checkoutDelayed')} />
  ) : (
    <Notice kind="pending" title={t('workspaceDesign.pendingTitle')} description={t('workspaceDesign.pendingDescription')} loading />
  )
}

function SubscriptionNotice({ data, locale, subscriptionNeedsConfirmation }: Pick<Props, 'data' | 'locale' | 'subscriptionNeedsConfirmation'>) {
  const t = useTranslations('billing')
  const subscription = data.subscription
  if (data.account.creditsUnlimited) return null
  if (subscriptionNeedsConfirmation)
    return (
      <Notice kind="unconfirmed" title={t('coverageUnconfirmed')} description={t('coverageUnconfirmedHint')} tone="warning" />
    )
  if (!subscription) return null
  if (needsPaymentAttention(data))
    return (
      <Notice
        kind="payment"
        title={t('workspaceDesign.paymentTitle')}
        description={t('canvas.paymentDescription')}
        tone="warning"
      />
    )
  if (subscription.status === 'paused')
    return <Notice kind="paused" title={t('statuses.paused')} description={t('subscriptionPaused')} />
  const periodKind = subscriptionPeriodKind(subscription)
  if (periodKind === 'none') return <Notice kind="ended" title={t('subscriptionEnded')} />
  if (periodKind !== 'ends') return null
  const date = formatBillingDate(subscription.currentPeriodEnd, locale)
  return (
    <Notice
      kind="cancellation"
      title={t('workspaceDesign.cancellationTitle')}
      description={date ? t('workspaceDesign.cancellationDescription', { date }) : undefined}
    />
  )
}

/** Banners above the plan card: checkout result, subscription state, Stripe availability. */
export function BillingNotices(props: Props) {
  const t = useTranslations('billing')
  return (
    <div className={styles.notices}>
      {props.data.mode === 'test' && (
        <Notice kind="test-mode" title={t('testModeTitle')} description={t('testModeDescription')} tone="warning" />
      )}
      <CheckoutNotice data={props.data} confirmationDelayed={props.confirmationDelayed} />
      <SubscriptionNotice
        data={props.data}
        locale={props.locale}
        subscriptionNeedsConfirmation={props.subscriptionNeedsConfirmation}
      />
      {!props.data.providerAvailable && <Notice kind="stale" title={t('providerStale')} tone="warning" />}
    </div>
  )
}
