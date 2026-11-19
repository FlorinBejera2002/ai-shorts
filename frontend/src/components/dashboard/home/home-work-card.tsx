'use client'

import { Link } from '@/i18n/navigation'
import { extractYouTubeId, youtubeThumbnailUrl } from '@/lib/youtube'
import type { HistoryJob } from '@/types/api'
import { Check, Film } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { type HomeWorkItem, selectWorkItems, useHomeWork } from './use-home-data'
import styles from './home.module.css'

function jobTitle(job: HistoryJob, fallback: { youtube: string; upload: string }) {
  if (job.sourceFilePath) {
    const name = job.sourceFilePath.split(/[\\/]/).pop() ?? ''
    return name.replace(/\.[a-z0-9]{2,4}$/i, '') || fallback.upload
  }
  return fallback.youtube
}

function JobThumb({ job, running }: { job: HistoryJob; running: boolean }) {
  const videoId = job.sourceUrl ? extractYouTubeId(job.sourceUrl) : null
  return (
    <span className={styles.workThumb} data-running={running ? '' : undefined} aria-hidden="true">
      {videoId ? <img src={youtubeThumbnailUrl(videoId)} alt="" loading="lazy" /> : <Film />}
    </span>
  )
}

function WorkRow({ item }: { item: HomeWorkItem }) {
  const t = useTranslations('dashboard.home.work')
  const { job } = item
  const title = jobTitle(job, { youtube: t('youtubeSource'), upload: t('uploadSource') })
  const running = item.kind === 'running'
  const progress = Math.max(0, Math.min(100, Math.round(job.progress ?? 0)))
  return (
    <li className={styles.workItem} data-home-work={item.kind}>
      <JobThumb job={job} running={running} />
      <span className={styles.workCopy}>
        <span className={styles.workTitle}>{title}</span>
        {running ? (
          <span className={styles.progressRow}>
            <span
              className={styles.progressTrack}
              role="progressbar"
              aria-label={t('progress', { title })}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress}
            >
              <span className={styles.progressFill} style={{ width: `${progress}%` }} />
            </span>
            <span className={styles.progressValue}>{progress}%</span>
          </span>
        ) : (
          <span className={styles.ready}>
            <Check aria-hidden="true" strokeWidth={2.5} />
            {t('clipsReady', { count: job._count?.clips ?? 0 })}
          </span>
        )}
      </span>
      {running ? null : (
        <Link href="/dashboard/clips" className={styles.secondaryButton}>
          {t('view')}
        </Link>
      )}
    </li>
  )
}

/** "În lucru": running jobs with progress, then recently finished ones. */
export function HomeWorkCard() {
  const t = useTranslations('dashboard.home.work')
  const { data, isPending, isError } = useHomeWork()
  const items = data ? selectWorkItems(data) : []
  const running = items.filter((item) => item.kind === 'running').length

  return (
    <section className={`${styles.card} ${styles.work} ${styles.side}`} aria-labelledby="home-work-title" data-home-work-card="">
      <div className={styles.cardHead}>
        <h2 id="home-work-title" className={styles.sectionTitle}>{t('title')}</h2>
        {items.length > 0 && (
          <span className={styles.muted}>
            {running ? t('activeCount', { count: running }) : t('readyCount', { count: items.length })}
          </span>
        )}
      </div>
      {isPending ? (
        <span className={styles.skeleton} style={{ height: 120 }} aria-hidden="true" />
      ) : isError ? (
        <p className={styles.muted} role="status">{t('loadError')}</p>
      ) : items.length ? (
        <ul className={styles.workList}>
          {items.map((item) => <WorkRow key={item.job.id} item={item} />)}
        </ul>
      ) : (
        <div className={styles.allDone} role="status">
          <span className={styles.allDoneIcon}><Check aria-hidden="true" strokeWidth={2.5} /></span>
          {t('allDone')}
        </div>
      )}
    </section>
  )
}
