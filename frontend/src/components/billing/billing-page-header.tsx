import { Button } from '@/components/ui/button'
import { LoadingIndicator } from '@/components/ui/loading-indicator'
import { ArrowLeft, RefreshCw } from 'lucide-react'
import { useTranslations } from 'next-intl'
import styles from './billing-page.module.css'

type Props = {
  title: string
  detail?: boolean
  refreshing?: boolean
  onBack: () => void
  onRefresh?: () => void
}

export function BillingPageHeader({
  title,
  detail = false,
  refreshing = false,
  onBack,
  onRefresh
}: Props) {
  const t = useTranslations('billing')
  return (
    <div className={styles.header}>
      <div className={styles.titleGroup}>
        {detail && (
          <button
            type="button"
            className={styles.back}
            onClick={onBack}
            data-billing-back=""
            aria-label={t('workspaceDesign.back')}
          >
            <ArrowLeft aria-hidden="true" />
          </button>
        )}
        <h1 tabIndex={-1} data-billing-title="">
          {title}
        </h1>
      </div>
      {onRefresh && (
        <Button
          type="button"
          variant="outline"
          size="icon"
          className={styles.refresh}
          onClick={onRefresh}
          disabled={refreshing}
          aria-busy={refreshing}
          aria-label={t(refreshing ? 'refreshingBilling' : 'refreshBilling')}
          title={t('refreshBilling')}
          data-billing-refresh=""
        >
          {refreshing ? <LoadingIndicator /> : <RefreshCw aria-hidden="true" />}
        </Button>
      )}
    </div>
  )
}
