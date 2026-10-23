import { LoadingIndicator } from '@/components/ui/loading-indicator'
import { subscriptionPeriodKind } from '@/lib/billing'
import type { BillingData } from '@/types/api'
import { AlertCircle, CheckCircle2, Info } from 'lucide-react'
import { useTranslations } from 'next-intl'
import styles from './billing-page.module.css'

type Props = {
  data: BillingData
  locale: string
  canceled: boolean
  confirmationDelayed: boolean
  subscriptionNeedsConfirmation: boolean
  recoveryFailed: boolean
}

function Notice({
  kind,
  title,
  description,
  tone = 'neutral',
  loading = false
}: {
  kind: string
  title: string
  description?: string
  tone?: 'neutral' | 'warning' | 'success' | 'error'
  loading?: boolean
}) {
  const Icon =
    tone === 'success'
      ? CheckCircle2
      : tone === 'warning' || tone === 'error'
        ? AlertCircle
        : Info
  return (
    <div
      className={styles.notice}
      data-billing-notice={kind}
      data-tone={tone}
      role={tone === 'error' || tone === 'warning' ? 'alert' : 'status'}
    >
      {loading ? (
        <LoadingIndicator className={styles.noticeIcon} />
      ) : (
        <Icon className={styles.noticeIcon} aria-hidden="true" />
      )}
      <div>
        <p className={styles.noticeTitle}>{title}</p>
        {description && (
          <p className={styles.noticeDescription}>{description}</p>
        )}
      </div>
    </div>
  )
}

function CheckoutNotice({
  data,
  canceled,
  confirmationDelayed
}: Pick<Props, 'data' | 'canceled' | 'confirmationDelayed'>) {
  const t = useTranslations('billing')
  switch (data.checkoutVerification?.status) {
    case 'complete':
      return (
        <Notice kind="complete" title={t('checkoutSuccess')} tone="success" />
      )
    case 'pending':
      return confirmationDelayed ? (
        <Notice
          kind="delayed"
          title={t('workspaceDesign.delayedTitle')}
          description={t('checkoutDelayed')}
        />
      ) : (
        <Notice
          kind="pending"
          title={t('workspaceDesign.pendingTitle')}
          description={t('workspaceDesign.pendingDescription')}
          loading
        />
      )
    case 'invalid':
      return (
        <Notice
          kind="invalid"
          title={t('checkoutVerificationFailed')}
          tone="error"
        />
      )
    case 'unavailable':
      return (
        <Notice
          kind="unavailable"
          title={t('checkoutVerificationUnavailable')}
          tone="warning"
        />
      )
    default:
      return canceled ? (
        <Notice kind="canceled" title={t('checkoutCanceled')} />
      ) : null
  }
}

function SubscriptionNotice({
  data,
  locale,
  subscriptionNeedsConfirmation
}: Pick<Props, 'data' | 'locale' | 'subscriptionNeedsConfirmation'>) {
  const t = useTranslations('billing')
  const subscription = data.subscription
  if (data.account.creditsUnlimited) return null
  if (subscriptionNeedsConfirmation)
    return (
      <Notice
        kind="unconfirmed"
        title={t('coverageUnconfirmed')}
        description={t('coverageUnconfirmedHint')}
        tone="warning"
      />
    )
  if (!subscription) return null
  if (['past_due', 'unpaid', 'incomplete'].includes(subscription.status))
    return (
      <Notice
        kind="payment"
        title={t('workspaceDesign.paymentTitle')}
        description={t('workspaceDesign.paymentDescription')}
        tone="warning"
      />
    )
  if (subscription.status === 'paused')
    return (
      <Notice
        kind="paused"
        title={t('statuses.paused')}
        description={t('subscriptionPaused')}
      />
    )
  const periodKind = subscriptionPeriodKind(subscription)
  if (periodKind === 'none')
    return <Notice kind="ended" title={t('subscriptionEnded')} />
  if (periodKind !== 'ends') return null
  const end = subscription.currentPeriodEnd
    ? new Date(subscription.currentPeriodEnd)
    : null
  const date =
    end && !Number.isNaN(end.getTime())
      ? new Intl.DateTimeFormat(locale, {
          day: 'numeric',
          month: 'short',
          year: 'numeric'
        }).format(end)
      : null
  return (
    <Notice
      kind="cancellation"
      title={t('workspaceDesign.cancellationTitle')}
      description={
        date
          ? t('workspaceDesign.cancellationDescription', { date })
          : t('cancellationScheduled')
      }
    />
  )
}

export function BillingNotices(props: Props) {
  const t = useTranslations('billing')
  return (
    <div className={styles.notices}>
      <CheckoutNotice
        data={props.data}
        canceled={props.canceled}
        confirmationDelayed={props.confirmationDelayed}
      />
      <SubscriptionNotice
        data={props.data}
        locale={props.locale}
        subscriptionNeedsConfirmation={props.subscriptionNeedsConfirmation}
      />
      {!props.data.providerAvailable && (
        <Notice kind="stale" title={t('providerStale')} tone="warning" />
      )}
      {props.recoveryFailed && (
        <Notice
          kind="refresh-error"
          title={t('refreshBillingError')}
          tone="warning"
        />
      )}
    </div>
  )
}
