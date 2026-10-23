'use client'

import { Link } from '@/i18n/navigation'
import { motion, useReducedMotion } from 'framer-motion'
import { ArrowRight, Film } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useState } from 'react'
import styles from './recent-clips.module.css'

interface ClipPreview {
  id: string
  title: string
  duration: number
  viralScore: number
  fileUrl: string | null
  thumbnailUrl: string | null
  resolution: string
}

export function RecentClips({ clips }: { clips: ClipPreview[] }) {
  const t = useTranslations('dashboard')
  const reduced = useReducedMotion()
  const visible = clips.slice(0, 4)

  if (clips.length === 0) return null

  return (
    <section data-home-recent aria-labelledby="home-recent-clips-title">
      <div className={styles.toolbar}>
        <div className={styles.heading}>
          <h2 id="home-recent-clips-title">{t('recentClips')}</h2>
          <span className={styles.count} data-home-recent-count>
            {clips.length}
          </span>
        </div>
        <Link href="/dashboard/clips" className={styles.viewAll}>
          {t('viewAll')}
          <ArrowRight size={17} aria-hidden="true" />
        </Link>
      </div>
      <motion.div layout={!reduced} className={styles.grid}>
        {visible.map((clip, index) => (
          <motion.div
            key={clip.id}
            className={styles.item}
            layout={!reduced}
            initial={reduced ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: index * 0.035 }}
          >
            <RecentClipCard clip={clip} />
          </motion.div>
        ))}
      </motion.div>
    </section>
  )
}

function RecentClipCard({ clip }: { clip: ClipPreview }) {
  const ro = useLocale() === 'ro'
  const [failedThumbnail, setFailedThumbnail] = useState<string | null>(null)
  const hasThumbnail =
    Boolean(clip.thumbnailUrl) && clip.thumbnailUrl !== failedThumbnail
  const duration = Math.max(0, Math.floor(clip.duration))
  const formattedDuration = `${Math.floor(duration / 60)
    .toString()
    .padStart(2, '0')}:${(duration % 60).toString().padStart(2, '0')}`

  return (
    <Link
      href={`/dashboard/clips/${clip.id}`}
      className={styles.card}
      data-home-clip={clip.id}
    >
      <div className={styles.poster}>
        {hasThumbnail ? (
          <img
            src={clip.thumbnailUrl!}
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => setFailedThumbnail(clip.thumbnailUrl)}
          />
        ) : (
          <div className={styles.placeholder} data-home-no-preview>
            <Film size={42} strokeWidth={1.25} aria-hidden="true" />
            <span>{ro ? 'Fără previzualizare' : 'No preview'}</span>
          </div>
        )}
        <span className={styles.duration}>{formattedDuration}</span>
        <span className={styles.open} aria-hidden="true">
          <ArrowRight size={21} strokeWidth={1.5} />
        </span>
      </div>
      <div className={styles.meta}>
        <h3 className={styles.title}>{clip.title}</h3>
        <div className={styles.info}>
          <span>{clip.resolution || (ro ? 'Clip video' : 'Video clip')}</span>
          {clip.viralScore > 0 && (
            <span className={styles.score}>
              {ro ? 'Scor' : 'Score'} {clip.viralScore}/10
            </span>
          )}
        </div>
      </div>
    </Link>
  )
}
