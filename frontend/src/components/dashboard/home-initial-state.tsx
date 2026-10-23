import { LoadingIndicator } from '@/components/ui/loading-indicator'
import { CircleAlert } from 'lucide-react'
import { useTranslations } from 'next-intl'
import styles from './home-workspace.module.css'

export function HomeInitialState({
  error,
  onRetry
}: {
  error: string | null
  onRetry: () => void
}) {
  const t = useTranslations('dashboard.homeDesign')
  return (
    <div
      className={styles.initial}
      data-home-initial={error ? 'error' : 'loading'}
      role={error ? 'alert' : 'status'}
      aria-busy={!error}
    >
      {error ? (
        <CircleAlert className={styles.errorIcon} aria-hidden="true" />
      ) : (
        <LoadingIndicator className="size-8" />
      )}
      <p>{t(error ? 'loadError' : 'loading')}</p>
      {error && (
        <button
          type="button"
          className={styles.primaryAction}
          onClick={onRetry}
        >
          {t('retry')}
        </button>
      )}
    </div>
  )
}
