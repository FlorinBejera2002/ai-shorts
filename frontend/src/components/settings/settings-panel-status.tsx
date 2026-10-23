import { Button } from '@/components/ui/button'
import { LoadingIndicator } from '@/components/ui/loading-indicator'
import { CircleAlert } from 'lucide-react'
import { useTranslations } from 'next-intl'
import styles from './settings-panels.module.css'

export function SettingsPanelStatus({
  error,
  onRetry
}: {
  error: string | null
  onRetry: () => void
}) {
  const t = useTranslations('settings')
  return (
    <div
      className={styles.loadState}
      role={error ? 'alert' : 'status'}
      data-settings-resource-state={error ? 'error' : 'loading'}
    >
      {error ? (
        <CircleAlert className={styles.loadIcon} aria-hidden="true" />
      ) : (
        <LoadingIndicator className={styles.loadIcon} />
      )}
      <p>{t(error ? 'panelsDesign.loadFailed' : 'panelsDesign.loading')}</p>
      {error && (
        <Button onClick={onRetry} className={styles.retry}>
          {t('retry')}
        </Button>
      )}
    </div>
  )
}

export function SettingsPanelFeedback({
  controller,
  group
}: {
  controller: {
    feedback: { group: string; text: string; error: boolean } | null
  }
  group: string
}) {
  const feedback = controller.feedback
  if (!feedback || feedback.group !== group) return null
  return (
    <p
      role={feedback.error ? 'alert' : 'status'}
      className={feedback.error ? styles.error : styles.success}
    >
      {feedback.text}
    </p>
  )
}
