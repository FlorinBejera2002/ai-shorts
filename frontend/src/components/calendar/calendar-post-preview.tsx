'use client'

import { PlatformBrandIcon } from '@/components/publishing/platform-brand-icon'
import { Button } from '@/components/ui/button'
import type { ScheduledPostRecord } from '@/lib/content-calendar'
import type { PublishingData } from '@/lib/publishing'
import { ArrowLeft, CalendarDays, Pencil } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useId } from 'react'
import { CalendarPostMedia } from './calendar-post-media'
import { StatusPill } from './calendar-presentation'
import { safeTimeZone } from './calendar-utils'
import styles from './calendar-post-preview.module.css'

type CalendarPostPreviewProps = {
  post: ScheduledPostRecord
  publishingClips: PublishingData['clips']
  locale: string
  onEdit: (post: ScheduledPostRecord) => void
  onBack: () => void
  backLabel: string
}

export function CalendarPostPreview({
  post,
  publishingClips,
  locale,
  onEdit,
  onBack,
  backLabel
}: CalendarPostPreviewProps) {
  const t = useTranslations('contentCalendar')
  const titleId = useId()
  const timeZone = safeTimeZone()
  const scheduledAt = new Date(post.scheduledAt)
  const dateLabel = new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone
  }).format(scheduledAt)
  const timeLabel = new Intl.DateTimeFormat(locale, {
    hour: 'numeric',
    minute: '2-digit',
    timeZone
  }).format(scheduledAt)
  const viewStatus = post.status === 'publishing' || post.status === 'published'
  const showStatus = viewStatus || post.status === 'failed'

  return (
    <section className={styles.preview} aria-labelledby={titleId} data-post-preview={post.id}>
      <button type="button" className={styles.back} onClick={onBack}>
        <ArrowLeft className="size-5" aria-hidden="true" />
        {backLabel}
      </button>

      <h2 id={titleId} className={styles.title}>{post.title}</h2>

      <div className={styles.media}>
        <CalendarPostMedia key={post.id} post={post} publishingClips={publishingClips} />
      </div>

      {post.caption && <p className={styles.caption}>{post.caption}</p>}

      <div className={styles.platforms}>
        {post.platforms.map(platform => (
          <span key={platform} className={styles.platform}>
            <PlatformBrandIcon provider={platform} className={styles.platformIcon} />
            {t(`platforms.${platform}`)}
          </span>
        ))}
      </div>

      <div className={styles.schedule}>
        <CalendarDays className={styles.calendarIcon} aria-hidden="true" />
        <div>
          <time dateTime={post.scheduledAt}>{dateLabel} · {timeLabel}</time>
          <p className={styles.timeZone}>{timeZone}</p>
        </div>
      </div>

      {showStatus && (
        <div className={styles.status} aria-live="polite">
          <StatusPill status={post.status} />
          {post.status === 'failed' && post.publishingError && (
            <p className={styles.error}>{post.publishingError}</p>
          )}
        </div>
      )}

      <Button
        type="button"
        variant="outline"
        className={styles.edit}
        onClick={() => onEdit(post)}
      >
        <Pencil className="size-4" aria-hidden="true" />
        {viewStatus ? t('preview.viewStatus') : t('publishing.editPost')}
      </Button>
    </section>
  )
}
