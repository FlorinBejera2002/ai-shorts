'use client'

import { Link } from '@/i18n/navigation'
import { ArrowRight, Plus } from 'lucide-react'
import { useTranslations } from 'next-intl'
import styles from './home-workspace.module.css'

export function StudioHero() {
  const t = useTranslations('dashboard.homeDesign')
  const nav = useTranslations('nav')
  return (
    <header className={styles.header} data-home-refresh-anchor="">
      <h1 className={styles.title}>{nav('home')}</h1>
      <div className={styles.headerActions}>
        <Link
          href="/dashboard/create"
          className={styles.primaryAction}
          data-home-new-clip=""
        >
          <Plus aria-hidden="true" />
          {t('newClip')}
        </Link>
        <Link
          href="/dashboard/clips"
          className={styles.libraryLink}
          data-home-open-library=""
        >
          {t('openLibrary')}
          <ArrowRight aria-hidden="true" />
        </Link>
      </div>
    </header>
  )
}
