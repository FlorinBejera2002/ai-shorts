import { RotateCw } from 'lucide-react'
import { useTranslations } from 'next-intl'
import ui from './billing-ui.module.css'
import styles from './billing-page.module.css'

function Bone({ className }: { className: string }) {
  return <span className={`${styles.bone} ${className}`} />
}

/** Skeleton of the overview (canvas Ab-Loading / Ab-M-Loading). */
export function BillingLoading() {
  const t = useTranslations('billing.workspaceDesign')
  return (
    <>
      <div className={styles.skeleton} role="status" aria-label={t('loading')} data-billing-initial="loading">
        <section className={`${ui.card} ${styles.skeletonSummary}`}>
          <span className={styles.skeletonPlan}>
            <span className={styles.skeletonLines}>
              <Bone className={styles.boneLabel} />
              <Bone className={styles.boneName} />
              <Bone className={styles.boneMeta} />
              <Bone className={styles.boneMetaShort} />
            </span>
            <span className={styles.skeletonActions}>
              <Bone className={styles.boneAction} />
              <Bone className={styles.boneActionWide} />
            </span>
          </span>
          <span className={styles.skeletonUsage}>
            <Bone className={styles.boneUsage} />
          </span>
        </section>
        <div className={styles.skeletonRow}>
          {[0, 1].map((card) => (
            <section key={card} className={`${ui.card} ${styles.skeletonCard}`}>
              <Bone className={styles.boneTitle} />
              <Bone className={styles.boneRow} />
              <Bone className={styles.boneRow} />
              <Bone className={styles.boneRow} />
            </section>
          ))}
        </div>
      </div>
      <span className={`${ui.muted} ${styles.loadingLine}`} aria-hidden="true">
        <RotateCw />
        {t('loading')}
      </span>
    </>
  )
}

/** Load failure (canvas Ab-Error / Ab-M-Error). */
export function BillingLoadError({ onRetry, retrying }: { onRetry: () => void; retrying: boolean }) {
  const t = useTranslations('billing.workspaceDesign')
  return (
    <section className={`${ui.card} ${styles.error}`} role="alert" data-billing-initial="error">
      <img src="/illustrations/billing-error.webp" alt="" width={160} height={160} />
      <b className={ui.heading}>{t('loadError')}</b>
      <button
        type="button"
        className={`${ui.button} ${ui.primary}`}
        onClick={onRetry}
        disabled={retrying}
        aria-busy={retrying}
        data-billing-retry=""
      >
        <RotateCw aria-hidden="true" />
        {t('tryAgain')}
      </button>
    </section>
  )
}
