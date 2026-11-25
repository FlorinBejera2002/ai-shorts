'use client'

import theme from '@/components/calendar/publishing-theme.module.css'
import { WorkspaceMobileHeader } from '@/components/dashboard/workspace-mobile-header'
import ui from '@/components/shared/reference-ui.module.css'
import { useApiResource } from '@/hooks/use-api-resource'
import { useTranslations } from 'next-intl'
import { FEEDBACK_REPORTS_PATH, type FeedbackReport } from './feedback-api'
import { FeedbackForm } from './feedback-form'
import { FeedbackReports } from './feedback-reports'
import styles from './feedback.module.css'

/** `/dashboard/feedback`: report a problem or suggest an idea, and follow earlier messages. */
export function FeedbackPage() {
  const t = useTranslations('feedback')
  const reports = useApiResource<{ items: FeedbackReport[] }>(FEEDBACK_REPORTS_PATH)
  return (
    <div className={`${theme.surface} ${ui.tokens} ${styles.page}`} data-reference-surface="" data-feedback-page="">
      <WorkspaceMobileHeader />
      <h1 className={`${ui.heading} ${styles.title}`}>{t('title')}</h1>
      <div className={styles.layout}>
        <FeedbackForm onSent={reports.reload} />
        <FeedbackReports items={reports.data?.items ?? null} error={reports.error} onRetry={reports.reload} />
      </div>
    </div>
  )
}
