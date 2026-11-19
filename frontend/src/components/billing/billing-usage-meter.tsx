import type { BillingUsage } from '@/lib/billing'
import { useTranslations } from 'next-intl'
import ui from './billing-ui.module.css'
import styles from './billing-summary.module.css'

type BillingUsageMeterProps = {
  usage: BillingUsage
  /** The free grant is a one-time trial that never resets. */
  trial: boolean
  resetDate: string | null
}

/** Usage of the plan limit as a percentage; never a credit count. */
export function BillingUsageMeter({ usage, trial, resetDate }: BillingUsageMeterProps) {
  const t = useTranslations('billing.canvas')
  const note = trial ? t('noReset') : resetDate ? t('resetsOn', { date: resetDate }) : null
  return (
    <div className={styles.usage} data-billing-usage={usage.used}>
      <span className={styles.usageValue}>
        <span className={`${ui.muted} ${styles.label}`}>{t(trial ? 'trialUsage' : 'monthlyUsage')}</span>
        <span className={styles.usageFigure}>
          <b className={ui.heading}>{usage.used}%</b>
          <span className={ui.muted}>{t('used')}</span>
        </span>
      </span>
      <b className={styles.usageRemaining}>{t('remaining', { percent: usage.remaining })}</b>
      {note && <span className={`${ui.muted} ${styles.usageNote}`}>{note}</span>}
      <span
        className={styles.usageBar}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={usage.used}
        aria-label={t('usageLabel', { percent: usage.used })}
      >
        <span style={{ width: `${usage.used}%` }} />
      </span>
    </div>
  )
}
