'use client'

import { Link } from '@/i18n/navigation'
import { Sparkles, Upload } from 'lucide-react'
import { useTranslations } from 'next-intl'
import styles from './home.module.css'

/** One bar for starting a clip: upload a video or open the create flow. */
export function HomeCreateBar() {
  const t = useTranslations('dashboard.home')

  return (
    <div className={styles.composer} data-home-composer="">
      <span className={styles.composerActions}>
        <Link href="/dashboard/create?mode=upload" className={styles.ghostButton} data-home-upload="">
          <Upload aria-hidden="true" />
          {t('upload')}
        </Link>
        <Link href="/dashboard/create" className={styles.primaryButton} data-home-new-clip="">
          <Sparkles aria-hidden="true" />
          {t('create')}
        </Link>
      </span>
    </div>
  )
}
