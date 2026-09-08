'use client'

import { Link } from '@/i18n/navigation'
import { motion, useReducedMotion } from 'framer-motion'
import { ArrowUpRight, Film, LayoutGrid, List, Search } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useState } from 'react'
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
  const [query, setQuery] = useState('')
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const reduced = useReducedMotion()
  const visible = clips
    .slice(0, 6)
    .filter((clip) =>
      clip.title.toLocaleLowerCase().includes(query.toLocaleLowerCase())
    )
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
        <div className={`${styles.clipTools} basis-full`}>
          <label className={`${styles.search} flex-1`}>
            <Search size={13} />
            <input
              aria-label={
                ro ? 'Caută în clipurile recente' : 'Search recent clips'
              }
              placeholder={ro ? 'Caută clipuri...' : 'Search clips...'}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <div
            className={styles.viewSwitch}
            role="group"
            aria-label={ro ? 'Afișare clipuri' : 'Clip display'}
          >
            <button
              type="button"
              aria-label={ro ? 'Grilă' : 'Grid view'}
              aria-pressed={view === 'grid'}
              onClick={() => setView('grid')}
            >
              <LayoutGrid size={14} />
            </button>
            <button
              type="button"
              aria-label={ro ? 'Listă' : 'List view'}
              aria-pressed={view === 'list'}
              onClick={() => setView('list')}
            >
              <List size={14} />
            </button>
          </div>
        </div>
      </div>
      <motion.div
        layout={!reduced}
        className={view === 'grid' ? styles.clipGrid : styles.clipList}
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
      {!visible.length && (
        <p
          role="status"
          className="border-y py-12 text-center text-sm text-muted-foreground"
        >
          {ro
            ? 'Niciun clip nu corespunde căutării.'
            : 'No clips match your search.'}
        </p>
      )}
    </div>
  )
}
