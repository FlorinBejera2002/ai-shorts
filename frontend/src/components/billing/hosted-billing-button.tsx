'use client'

import { LoadingIndicator } from '@/components/ui/loading-indicator'
import type { BillingLocale, PaidBillingPlanId } from '@/lib/billing'
import { ExternalLink } from 'lucide-react'
import { useHostedBillingAction } from './use-hosted-billing-action'
import ui from './billing-ui.module.css'
import styles from './hosted-billing-button.module.css'

type HostedBillingButtonProps = {
  locale: BillingLocale
  label: string
  loadingLabel: string
  errorLabel: string
  variant?: 'primary' | 'secondary'
  /** Checkout opens Stripe Checkout for this plan; without it the button opens the billing portal. */
  planId?: PaidBillingPlanId
  iconPosition?: 'start' | 'end'
  disabled?: boolean
  className?: string
}

/** Starts a hosted Stripe flow (Checkout or the billing portal) and follows its validated URL. */
export function HostedBillingButton({
  locale,
  label,
  loadingLabel,
  errorLabel,
  variant = 'secondary',
  planId,
  iconPosition = 'start',
  disabled = false,
  className = ''
}: HostedBillingButtonProps) {
  const kind = planId ? 'checkout' : 'portal'
  const { start, busy, loading, error, errorId } = useHostedBillingAction(
    kind,
    planId ? { locale, planId } : { locale },
    errorLabel
  )
  const icon = loading ? <LoadingIndicator /> : <ExternalLink aria-hidden="true" />
  return (
    <span className={`${styles.wrap} ${className}`}>
      <button
        type="button"
        className={`${ui.button} ${variant === 'primary' ? ui.primary : ui.secondary} ${styles.button}`}
        onClick={() => void start(disabled)}
        disabled={disabled || busy}
        aria-busy={loading}
        aria-describedby={error ? errorId : undefined}
        data-billing-hosted={kind}
      >
        {iconPosition === 'start' && icon}
        <span>{loading ? loadingLabel : label}</span>
        {iconPosition === 'end' && icon}
      </button>
      {error && (
        <span id={errorId} className={styles.error} role="alert">
          {error}
        </span>
      )}
    </span>
  )
}
