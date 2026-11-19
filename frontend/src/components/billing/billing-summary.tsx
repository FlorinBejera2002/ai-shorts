'use client'

import { isPaidBillingPlanId, planUsageMultiple, type BillingLocale } from '@/lib/billing'
import type { BillingPlanPrice } from '@/types/api'
import { CalendarDays, CreditCard, Gauge, Sparkles, type LucideIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'
import type { BillingOverview } from './billing-overview'
import { formatBillingDate, formatBillingPrice } from './billing-format'
import { BillingUsageMeter } from './billing-usage-meter'
import ui from './billing-ui.module.css'
import styles from './billing-summary.module.css'

type BillingSummaryProps = {
  overview: BillingOverview
  planName: string
  planPrice: BillingPlanPrice | undefined
  locale: BillingLocale
  actions: ReactNode
}

type MetaItem = { Icon: LucideIcon; text: string }

const PERIOD_KEYS = { renews: 'renewsOn', ends: 'endsOn', period: 'periodEndsOn' } as const

function usePeriodText(period: BillingOverview['period'], locale: BillingLocale) {
  const t = useTranslations('billing')
  const date = formatBillingDate(period?.date, locale)
  if (!period || !date) return null
  if (period.kind === 'lastConfirmed') return `${t('lastConfirmedPeriod')} ${date}`
  return t(`canvas.${PERIOD_KEYS[period.kind]}`, { date })
}

function useMetaItems({ overview, planPrice, locale }: Omit<BillingSummaryProps, 'planName' | 'actions'>) {
  const t = useTranslations('billing')
  const { access, currentPlan, period } = overview
  const periodText = usePeriodText(period, locale)
  if (access === 'admin') return [{ Icon: Sparkles, text: t('adminAccess') }]
  if (!isPaidBillingPlanId(currentPlan))
    return [
      { Icon: CreditCard, text: periodText ?? t('noActiveSubscription') },
      { Icon: Gauge, text: t('canvas.freeTrialMeta') },
      { Icon: Sparkles, text: t('summaryDesign.freeLimits') }
    ]
  const multiple = planUsageMultiple(currentPlan)
  const items: (MetaItem | null)[] = [
    planPrice
      ? { Icon: CreditCard, text: t('canvas.pricePerMonth', { price: formatBillingPrice(planPrice, locale) }) }
      : null,
    {
      Icon: Gauge,
      text: multiple > 1 ? t('canvas.usageMultiple', { count: multiple }) : t('canvas.standardUsage')
    },
    periodText ? { Icon: CalendarDays, text: periodText } : null
  ]
  return items.filter((item) => item !== null)
}

/** "Plan curent" card: plan, state, price/usage/renewal facts, actions and the usage meter. */
export function BillingSummary({ overview, planName, planPrice, locale, actions }: BillingSummaryProps) {
  const t = useTranslations('billing')
  const meta = useMetaItems({ overview, planPrice, locale })
  const { status, usage, period, access } = overview
  return (
    <section className={styles.summary} aria-labelledby="billing-overview-title" data-billing-summary="">
      <div className={styles.plan}>
        <div className={styles.planInfo}>
          <span id="billing-overview-title" className={`${ui.muted} ${styles.label}`}>
            {t(access === 'paid' ? 'currentPlan' : 'summaryDesign.currentAccess')}
          </span>
          <div className={styles.planHeading}>
            <b className={`${ui.heading} ${styles.planName}`} data-billing-effective-plan="">
              {planName}
            </b>
            {status && (
              <span className={ui.badge} data-tone={status.tone} data-billing-status="">
                {t(status.key)}
              </span>
            )}
          </div>
          <ul className={styles.meta}>
            {meta.map(({ Icon, text }) => (
              <li key={text}>
                <Icon aria-hidden="true" />
                <span>{text}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className={styles.actions} data-billing-summary-actions="">
          {actions}
        </div>
      </div>
      {usage && (
        <BillingUsageMeter
          usage={usage}
          trial={access === 'free'}
          resetDate={usage.resets ? formatBillingDate(period?.date, locale) : null}
        />
      )}
    </section>
  )
}
