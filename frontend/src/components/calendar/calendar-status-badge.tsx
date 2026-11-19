'use client'

import type { ScheduledPostRecord } from '@/lib/content-calendar'
import { useTranslations } from 'next-intl'
import styles from './calendar-status-badge.module.css'

/** Neutral pill with a status dot; failed and published use the danger and success tones. */
export function CalendarStatusBadge({
  status,
  className
}: {
  status: ScheduledPostRecord['status']
  className?: string
}) {
  const t = useTranslations('contentCalendar')
  const label =
    status === 'publishing'
      ? t('publishing.publishingBadge')
      : t(`statuses.${status}`)
  return (
    <span
      className={`${styles.badge} ${className ?? ''}`}
      data-status={status}
    >
      <span className={styles.dot} aria-hidden="true" />
      {label}
    </span>
  )
}
