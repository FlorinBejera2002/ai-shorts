import { Button } from '@/components/ui/button'
import { LoadingIndicator } from '@/components/ui/loading-indicator'
import { AlertCircle, RefreshCw } from 'lucide-react'
import { useTranslations } from 'next-intl'
import styles from './billing-page.module.css'

export function BillingInitialState({
  error = false,
  retry
}: {
  error?: boolean
  retry?: () => void
}) {
  const t = useTranslations('billing.workspaceDesign')
  return (
    <div
      className={styles.initial}
      role={error ? 'alert' : 'status'}
      data-billing-initial={error ? 'error' : 'loading'}
    >
      {error ? (
        <AlertCircle className={styles.initialIcon} aria-hidden="true" />
      ) : (
        <LoadingIndicator className={styles.initialIcon} />
      )}
      <p>{t(error ? 'loadError' : 'loading')}</p>
      {error && (
        <Button onClick={retry}>
          <RefreshCw aria-hidden="true" />
          {t('tryAgain')}
        </Button>
      )}
    </div>
  )
}
