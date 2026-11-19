'use client'

import { Link } from '@/i18n/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { useMemo } from 'react'
import styles from './app-sidebar.module.css'
import { useMonthlyUsage } from './sidebar-usage'

/** "Monthly usage" card linking to billing; rendered only when the account has a monthly allowance. */
export function SidebarUsageCard({ onNavigate }: { onNavigate: () => void }) {
  const t = useTranslations('nav')
  const locale = useLocale()
  const { data: usage } = useMonthlyUsage()
  const dayMonth = useMemo(
    () => new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }),
    [locale]
  )
  if (!usage) return null

  const resetDate = usage.resetsAt
    ? dayMonth.format(new Date(usage.resetsAt))
    : null

  return (
    <Link
      href="/dashboard/billing"
      onClick={onNavigate}
      prefetch={false}
      aria-label={t('monthlyUsageLabel', { percent: usage.percent })}
      className={styles.usage}
      data-sidebar-usage=""
    >
      <span className={styles.usageHeading}>
        <span>{t('monthlyUsage')}</span>
        <span className={styles.usageValue}>{usage.percent}%</span>
      </span>
      <span aria-hidden="true" className={styles.usageTrack}>
        <span
          className={styles.usageFill}
          style={{ width: `${usage.percent}%` }}
        />
      </span>
      {resetDate && (
        <span className={styles.usageReset}>
          {t('usageResets', { date: resetDate })}
        </span>
      )}
    </Link>
  )
}
