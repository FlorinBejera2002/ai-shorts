'use client'

import { RotateCcw } from 'lucide-react'
import { useTranslations } from 'next-intl'
import styles from './home.module.css'

const Bone = ({ w, h, r }: { w: string; h: number; r?: number }) => (
  <span className={styles.skeleton} style={{ width: w, height: h, borderRadius: r }} />
)

/** Placeholder with the shape of the page while /api/dashboard loads. */
export function HomeLoading() {
  const t = useTranslations('dashboard.home')
  return (
    <div role="status" aria-busy="true" aria-label={t('loading')} data-home-initial="loading" style={{ display: 'contents' }}>
      <div className={styles.row}>
        <div className={`${styles.card} ${styles.hero}`} style={{ flexDirection: 'column', alignItems: 'stretch', gap: 16 }}>
          <Bone w="40%" h={32} />
          <Bone w="100%" h={56} r={999} />
        </div>
        <div className={`${styles.card} ${styles.work} ${styles.side}`}>
          <Bone w="50%" h={18} />
          <Bone w="100%" h={54} />
          <Bone w="100%" h={54} />
        </div>
      </div>
      <div className={`${styles.card} ${styles.stats}`}>
        <Bone w="100%" h={60} />
      </div>
      <div className={styles.clips}>
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className={styles.clip}>
            <Bone w="100%" h={164} r={16} />
            <Bone w="80%" h={14} />
          </div>
        ))}
      </div>
    </div>
  )
}

/** /api/dashboard failed: illustration, short message and retry. */
export function HomeError({ onRetry }: { onRetry: () => void }) {
  const t = useTranslations('dashboard.home')
  return (
    <section className={`${styles.card} ${styles.state}`} role="alert" data-home-initial="error">
      <img className={styles.stateIllustration} src="/illustrations/load-error.webp" alt={t('errorIllustrationAlt')} width={220} height={220} />
      <h2>{t('loadError')}</h2>
      <button type="button" className={styles.primaryButton} onClick={onRetry}>
        <RotateCcw aria-hidden="true" />
        {t('retry')}
      </button>
    </section>
  )
}
