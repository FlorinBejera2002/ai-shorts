'use client'

import { Link } from '@/i18n/navigation'
import { motion, useReducedMotion } from 'framer-motion'
import { ArrowUpRight, Film } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import styles from './studio-home.module.css'

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
  const ro = useLocale() === 'ro'
  const reduced = useReducedMotion()
  const visible = clips.slice(0, 4)
  if (clips.length === 0) return null
  return (
    <div>
      <div className={styles.clipToolbar}>
        <div className="flex items-center gap-3">
          <h2 className="text-[15px] font-semibold tracking-tight">
            {t('recentClips')}
          </h2>
          <span className="rounded border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
            {clips.length}
          </span>
        </div>
        <Link
          href="/dashboard/clips"
          className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-primary"
        >
          {t('viewAll')}
          <ArrowUpRight size={13} />
        </Link>
      </div>
      <motion.div
        layout={!reduced}
        className={styles.clipGrid}
      >
        {visible.map((clip, index) => (
          <motion.div
            key={clip.id}
            layout={!reduced}
            initial={reduced ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: index * 0.035 }}
          >
            <Link
              href={`/dashboard/clips/${clip.id}`}
              className={styles.clipCard}
            >
              <div className={styles.poster}>
                {clip.thumbnailUrl ? (
                  <img src={clip.thumbnailUrl} alt="" loading="lazy" />
                ) : (
                  <div className={styles.placeholder}>
                    <Film size={24} strokeWidth={1} />
                    <span>{ro ? 'Fără previzualizare' : 'No preview'}</span>
                  </div>
                )}
                <span className={styles.play}>
                  <ArrowUpRight strokeWidth={1.5} />
                </span>
                <span className={styles.duration}>
                  {Math.floor(clip.duration / 60)
                    .toString()
                    .padStart(2, '0')}
                  :
                  {Math.floor(clip.duration % 60)
                    .toString()
                    .padStart(2, '0')}
                </span>
              </div>
              <div className={styles.clipMeta}>
                <h3 className={styles.clipTitle}>{clip.title}</h3>
                <div className={styles.clipInfo}>
                  <span>
                    {clip.resolution || (ro ? 'Clip video' : 'Video clip')}
                  </span>
                  {clip.viralScore > 0 && (
                    <span>
                      {ro ? 'Scor' : 'Score'}{' '}
                      <span className="font-medium text-foreground">
                        {clip.viralScore}/10
                      </span>
                    </span>
                  )}
                </div>
              </div>
            </Link>
          </motion.div>
        ))}
      </motion.div>
    </div>
  )
}
