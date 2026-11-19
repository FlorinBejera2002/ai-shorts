'use client'

import { Link } from '@/i18n/navigation'
import { Plus, RotateCcw } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'
import styles from './clips.module.css'

function StateCard({
  kind,
  image,
  alt,
  size,
  title,
  children
}: {
  kind: string
  image: string
  alt: string
  size: number
  title: string
  children: ReactNode
}) {
  return (
    <section className={`${styles.card} ${styles.state}`} data-clips-state={kind} data-kind={kind} role={kind === 'error' ? 'alert' : undefined}>
      <img src={image} alt={alt} width={size} height={size} style={{ width: size }} />
      <h2 className={styles.heading}>{title}</h2>
      {children}
    </section>
  )
}

export function ClipsEmptyLibrary({ mobile }: { mobile: boolean }) {
  const t = useTranslations('clipsLibrary')
  return (
    <StateCard kind="empty" image="/illustrations/library-empty.webp" alt={t('illustrations.empty')} size={mobile ? 230 : 260} title={t('emptyLibrary')}>
      <Link href="/dashboard/create" className={`${styles.button} ${styles.primary} ${styles.focus}`}>
        <Plus aria-hidden="true" strokeWidth={2.5} style={{ width: 18, height: 18 }} />
        {t('newClip')}
      </Link>
    </StateCard>
  )
}

export function ClipsNoResults({ mobile, onClear }: { mobile: boolean; onClear: () => void }) {
  const t = useTranslations('clipsLibrary')
  return (
    <StateCard kind="no-results" image="/illustrations/clips-noresults.webp" alt={t('illustrations.noResults')} size={mobile ? 240 : 220} title={t('noResults')}>
      <button type="button" className={`${styles.button} ${styles.secondary} ${styles.focus}`} onClick={onClear}>
        {t('clearFilters')}
      </button>
    </StateCard>
  )
}

export function ClipsLoadError({ mobile, onRetry }: { mobile: boolean; onRetry: () => void }) {
  const t = useTranslations('clipsLibrary')
  return (
    <StateCard kind="error" image="/illustrations/load-error.webp" alt={t('illustrations.error')} size={mobile ? 200 : 220} title={t('loadError')}>
      <button type="button" className={`${styles.button} ${styles.primary} ${styles.focus}`} onClick={onRetry}>
        <RotateCcw aria-hidden="true" />
        {t('retry')}
      </button>
    </StateCard>
  )
}

/** A project (or "Fără proiect") without clips: a dashed drop area. */
export function ClipsEmptyProject({ mobile, unassigned = false }: { mobile: boolean; unassigned?: boolean }) {
  const t = useTranslations('clipsLibrary')
  return (
    <section className={styles.dropZone} data-clips-state={unassigned ? 'no-unassigned' : 'empty-project'}>
      <img src="/illustrations/clips-emptyproject.webp" alt={t('illustrations.emptyProject')} width={mobile ? 180 : 200} height={mobile ? 180 : 200} />
      <h2 className={styles.heading}>{unassigned ? t('noUnassigned') : t('emptyProject')}</h2>
      {!unassigned && <span className={styles.muted}>{mobile ? t('emptyProjectMenu') : t('emptyProjectDrag')}</span>}
    </section>
  )
}

export function ClipsLoadingGrid({ mobile }: { mobile: boolean }) {
  const t = useTranslations('clipsLibrary')
  return (
    <div className={styles.grid} role="status" aria-label={t('loading')} data-clips-state="loading">
      {Array.from({ length: mobile ? 4 : 10 }, (_, index) => (
        <div key={index} className={`${styles.card} ${styles.clip}`}>
          <span className={styles.skeleton} style={{ height: mobile ? 268 : 230, borderRadius: 16 }} />
          <span className={styles.skeleton} style={{ width: '80%', height: 14 }} />
          <span className={styles.skeleton} style={{ width: '50%', height: 12 }} />
        </div>
      ))}
    </div>
  )
}

export function ClipsRailSkeleton() {
  return (
    <aside className={`${styles.card} ${styles.rail}`} aria-hidden="true">
      {[0, 1, 2, 3, 4].map((row) => (
        <span key={row} className={styles.skeleton} style={{ height: 32, margin: '6px 8px' }} />
      ))}
    </aside>
  )
}
