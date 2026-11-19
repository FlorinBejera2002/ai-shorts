'use client'

import { Link } from '@/i18n/navigation'
import { formatClipAge, formatClipLength } from '@/lib/clip-time'
import type { FullClip } from '@/types/api'
import { ChevronRight, Film } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useState } from 'react'
import styles from './home.module.css'

const VISIBLE = 6

function ClipCard({ clip }: { clip: FullClip }) {
  const t = useTranslations('dashboard.home.recent')
  const locale = useLocale()
  const [failed, setFailed] = useState(false)
  const thumbnail = clip.thumbnailUrl && !failed ? clip.thumbnailUrl : null
  return (
    <Link href={`/dashboard/clips/${clip.id}`} className={`${styles.clip} ${styles.focusable}`} data-home-clip={clip.id}>
      <span className={styles.clipPoster}>
        {thumbnail ? (
          <img src={thumbnail} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} />
        ) : (
          <span className={styles.clipPlaceholder}>
            <Film aria-hidden="true" strokeWidth={1.25} />
            {t('noPreview')}
          </span>
        )}
        {clip.hasSubtitles && <span className={styles.clipBadge} aria-label={t('subtitles')}>CC</span>}
        <span className={styles.clipDuration}>{formatClipLength(clip.duration)}</span>
      </span>
      <span className={styles.clipMeta}>
        <strong>{clip.title}</strong>
        <span className={styles.muted}>{formatClipAge(clip.createdAt, locale)}</span>
      </span>
    </Link>
  )
}

/** Six latest clips; scrolls sideways on phones. */
export function HomeRecentClips({ clips }: { clips: FullClip[] }) {
  const t = useTranslations('dashboard.home.recent')
  if (!clips.length) return null
  return (
    <section className={styles.recent} aria-labelledby="home-recent-title" data-home-recent="">
      <div className={styles.recentHead}>
        <h2 id="home-recent-title">{t('title')}</h2>
        <Link href="/dashboard/clips" className={styles.inlineLink}>
          {t('viewAll')}
          <ChevronRight aria-hidden="true" />
        </Link>
      </div>
      <div className={styles.clips}>
        {clips.slice(0, VISIBLE).map((clip) => <ClipCard key={clip.id} clip={clip} />)}
      </div>
    </section>
  )
}
