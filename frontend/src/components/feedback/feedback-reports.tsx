'use client'

import ui from '@/components/shared/reference-ui.module.css'
import { LoadingIndicator } from '@/components/ui/loading-indicator'
import { useLocale, useTranslations } from 'next-intl'
import { useMemo } from 'react'
import type { FeedbackReport } from './feedback-api'
import styles from './feedback.module.css'

/** The user's earlier messages with the status an admin set. */
export function FeedbackReports({
  items,
  error,
  onRetry
}: {
  items: FeedbackReport[] | null
  error: string | null
  onRetry: () => void
}) {
  const t = useTranslations('feedback')
  const locale = useLocale()
  const date = useMemo(() => new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }), [locale])
  return (
    <section className={`${styles.card} ${styles.reports}`} aria-labelledby="feedback-reports-title">
      <h2 id="feedback-reports-title" className={`${ui.heading} ${styles.cardTitle}`}>
        {t('reportsTitle')}
      </h2>
      {error ? (
        <div className={styles.state} role="alert">
          <p>{t('loadFailed')}</p>
          <button type="button" className={`${ui.button} ${ui.secondary} ${ui.focus}`} onClick={onRetry}>
            {t('retry')}
          </button>
        </div>
      ) : items === null ? (
        <div className={styles.state} role="status">
          <LoadingIndicator className="size-6" />
        </div>
      ) : items.length === 0 ? (
        <p className={styles.empty}>{t('reportsEmpty')}</p>
      ) : (
        <ul className={styles.list}>
          {items.map((item) => (
            <li key={item.id} className={styles.report} data-feedback-report={item.status}>
              <div className={styles.reportMeta}>
                <span>
                  {t(`categories.${item.category}`)} · {date.format(new Date(item.createdAt))}
                  {item.images > 0 && ` · ${t('imageCount', { count: item.images })}`}
                </span>
                <span className={styles.status} data-status={item.status}>
                  {t(`status.${item.status}`)}
                </span>
              </div>
              <p className={styles.reportMessage}>{item.message}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
