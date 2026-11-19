import { LoadingIndicator } from '@/components/ui/loading-indicator'
import { Link } from '@/i18n/navigation'
import { ChevronLeft, RotateCw } from 'lucide-react'
import { useTranslations } from 'next-intl'
import ui from './billing-ui.module.css'
import styles from './billing-page.module.css'

type Props = {
  title: string
  /** Sub-pages (plans, invoices, details) show a back button instead of the refresh action. */
  detail?: boolean
  refreshing?: boolean
  onBack: () => void
  onRefresh?: () => void
}

/**
 * Desktop: title with refresh, or "Înapoi" + title on sub-pages. Phone: the page name lives in the
 * mobile header, so the overview starts with "Meniu" (back to Settings) and sub-pages with
 * "Plan și facturare" above their title.
 */
export function BillingPageHeader({ title, detail = false, refreshing = false, onBack, onRefresh }: Props) {
  const t = useTranslations('billing')
  const nav = useTranslations('nav')
  return (
    <div className={styles.header} data-detail={detail || undefined}>
      {detail ? (
        <button type="button" className={`${ui.button} ${ui.secondary} ${styles.back}`} onClick={onBack} data-billing-back="">
          <ChevronLeft aria-hidden="true" />
          <span className={styles.desktopOnly}>{t('canvas.back')}</span>
          <span className={styles.mobileOnly}>{t('workspaceDesign.title')}</span>
        </button>
      ) : (
        <Link href="/dashboard/settings" className={`${ui.button} ${ui.secondary} ${styles.back} ${styles.menuLink}`} data-billing-menu="">
          <ChevronLeft aria-hidden="true" />
          {nav('menu')}
        </Link>
      )}
      <h1 tabIndex={-1} className={`${ui.heading} ${styles.title}`} data-billing-title="">
        {title}
      </h1>
      {onRefresh && (
        <button
          type="button"
          className={`${ui.iconButton} ${styles.refresh}`}
          onClick={onRefresh}
          disabled={refreshing}
          aria-busy={refreshing}
          aria-label={t(refreshing ? 'refreshingBilling' : 'refreshBilling')}
          title={t('refreshBilling')}
          data-billing-refresh=""
        >
          {refreshing ? <LoadingIndicator /> : <RotateCw aria-hidden="true" />}
        </button>
      )}
    </div>
  )
}
