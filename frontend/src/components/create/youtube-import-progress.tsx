'use client'

import { ChevronRight } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { LoadingIndicator } from '@/components/ui/loading-indicator'
import { Link } from '@/i18n/navigation'
import styles from './processing-card.module.css'
import { useYouTubeImports } from './use-youtube-imports'
import {
  importProgressPhase,
  progressItems,
  type ImportProgressPhase,
  type YouTubeImportItem
} from './youtube-import-model'

interface YouTubeImportProgressProps {
  /** Returns to the channel list so more videos can be chosen. */
  onChooseAnother: () => void
}

const PHASE_TITLE_KEYS = {
  checking: 'checkingTitle',
  importing: 'importingTitle',
  ready: 'readyTitle',
  partial: 'partialTitle',
  incomplete: 'incompleteTitle'
} as const satisfies Record<ImportProgressPhase, string>

/**
 * Progress card shown after the Google export consent returns with success. It lists the latest
 * import's selected videos with their state and polls while any of them is still moving.
 */
export function YouTubeImportProgress({ onChooseAnother }: YouTubeImportProgressProps) {
  const t = useTranslations('create.youtubeImport')
  const imports = useYouTubeImports(true)
  const items = progressItems(imports.data ?? [])
  const phase = importProgressPhase(imports.data, imports.isError)
  // A list that never loaded is retried in place; an incomplete or finished import goes back to the channel list.
  const listNeverLoaded = imports.isError && imports.data === undefined
  const onAction = listNeverLoaded ? () => void imports.refetch() : onChooseAnother

  return (
    <section className="yt-import-progress" data-testid="youtube-import-progress" aria-labelledby="yt-import-progress-title">
      <div className={styles.card}>
        <div className={`${styles.art} ${styles.animated} yt-import-progress__art${phase === 'importing' ? ' yt-import-progress__art--large' : ''}`}>
          <span className={styles.disc} aria-hidden="true" />
          <span className={styles.ring} aria-hidden="true" />
          <span className={styles.orbit} aria-hidden="true"><span className={styles.dot} /></span>
          <img className={styles.illustration} src="/illustrations/create-youtube-download.webp" alt="" />
        </div>
        <div className={styles.copy}>
          <h2 id="yt-import-progress-title" className={`${styles.title} yt-import-progress__title`}>{t(PHASE_TITLE_KEYS[phase])}</h2>
        </div>
        {phase === 'checking' && (
          <p role="status" className="yt-status"><LoadingIndicator className="size-4" /></p>
        )}
        {items.length > 0 && (
          <ul className="yt-import-list" aria-label={t('listLabel')}>
            {items.map((item) => (
              <ImportItemRow key={item.video_id} item={item} />
            ))}
          </ul>
        )}
        {phase !== 'checking' && phase !== 'importing' && (
          <button type="button" className={`${phase === 'partial' ? 'yt-primary-button' : 'yt-secondary-button'} yt-import-progress__action`} onClick={onAction}>
            {phase === 'incomplete' ? t('retry') : t('chooseAnother')}
          </button>
        )}
      </div>
    </section>
  )
}

/**
 * State of one imported video. A processing item opens its job, so it reads as an outlined pill
 * with a chevron (canvas "Se procesează ›"); a moving item shows a spinner; the rest is plain text.
 */
function ImportItemState({ status, label, opensJob }: { status: YouTubeImportItem['status']; label: string; opensJob: boolean }) {
  if (opensJob) {
    return (
      <span className="yt-import-row__pill" data-state={status}>
        {label}
        <ChevronRight className="size-3.5" aria-hidden="true" />
      </span>
    )
  }
  return (
    <span className="yt-import-row__state" data-state={status}>
      {status === 'importing' && <span className="yt-import-spinner" aria-hidden="true" />}
      {label}
    </span>
  )
}

/** One selected video: thumbnail, title and its state. A processing item opens its job. */
function ImportItemRow({ item }: { item: YouTubeImportItem }) {
  const t = useTranslations('create.youtubeImport')
  const opensJob = item.status === 'processing' && Boolean(item.job_id)
  const content = (
    <>
      <span className="yt-library-row__thumb">
        {item.thumbnail_url && <img src={item.thumbnail_url} alt="" />}
      </span>
      <span className="yt-import-row__title">{item.title}</span>
      <ImportItemState status={item.status} label={t(`itemState.${item.status}`)} opensJob={opensJob} />
    </>
  )

  if (opensJob) {
    return (
      <li>
        <Link href={`/dashboard/jobs/${item.job_id}`} className="yt-import-row" data-state={item.status}>
          {content}
        </Link>
      </li>
    )
  }
  return (
    <li>
      <div className="yt-import-row" data-state={item.status}>{content}</div>
    </li>
  )
}
