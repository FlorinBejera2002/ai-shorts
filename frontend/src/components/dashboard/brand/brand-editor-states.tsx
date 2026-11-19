'use client'

import { useIsMobile } from '@/hooks/use-mobile'
import { Link } from '@/i18n/navigation'
import { ChevronLeft, RotateCcw } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { CSSProperties } from 'react'
import styles from './brand-editor.module.css'

function Bone({ width = '100%', height, radius }: { width?: CSSProperties['width']; height: number; radius?: number }) {
  return <span className={styles.bone} style={{ width, height, borderRadius: radius }} aria-hidden="true" />
}

/** Phones keep a way back while the kit loads or fails. */
function MobileBack() {
  const kits = useTranslations('brandKits')
  return (
    <Link href="/dashboard/brand" className={`${styles.button} ${styles.secondary} ${styles.mobileBack} ${styles.focus}`}>
      <ChevronLeft aria-hidden="true" />
      {kits('allKits')}
    </Link>
  )
}

/** Canvas Br-Loading / Br-M-Loading. */
export function BrandEditorSkeleton() {
  const t = useTranslations('brand')
  const mobile = useIsMobile()
  const preview = (
    <section className={`${styles.card} ${styles.skeletonCard}`}>
      <Bone width={mobile ? 120 : 140} height={mobile ? 18 : 22} />
      {!mobile && <Bone height={34} radius={999} />}
      <span style={{ alignSelf: 'center' }}>
        <Bone width={mobile ? 214 : 270} height={mobile ? 380 : 480} radius={18} />
      </span>
    </section>
  )
  return (
    <div className={styles.page}>
      <MobileBack />
      <div className={styles.layout} role="status" aria-label={t('loading')} data-brand-loading="">
        {mobile && preview}
        <div className={styles.controls}>
          <section className={`${styles.card} ${styles.skeletonCard}`}>
            <Bone width={140} height={18} />
            <Bone height={72} radius={14} />
            {!mobile && <Bone height={40} />}
          </section>
          {!mobile && (
            <section className={`${styles.card} ${styles.skeletonCard}`}>
              <Bone width={120} height={18} />
              <span className={styles.boneRow}>
                <Bone width="33%" height={84} radius={16} />
                <Bone width="33%" height={84} radius={16} />
                <Bone width="33%" height={84} radius={16} />
              </span>
              <Bone height={40} />
              <Bone height={40} />
              <Bone height={40} />
            </section>
          )}
        </div>
        {!mobile && <div className={styles.side}>{preview}</div>}
      </div>
    </div>
  )
}

/** Canvas Br-Error / Br-M-Error. */
export function BrandEditorError({ onRetry }: { onRetry: () => void }) {
  const t = useTranslations('brand')
  return (
    <div className={styles.page}>
      <MobileBack />
      <section className={`${styles.card} ${styles.state}`} role="alert" data-brand-error="">
        <img src="/illustrations/brand-error.webp" alt={t('editor.errorIllustration')} width={180} height={180} />
        <b className={styles.heading}>{t('loadErrorTitle')}</b>
        <span className={styles.muted}>{t('editor.errorText')}</span>
        <button type="button" className={`${styles.button} ${styles.primary} ${styles.focus}`} onClick={onRetry}>
          <RotateCcw aria-hidden="true" />
          {t('retry')}
        </button>
      </section>
    </div>
  )
}
