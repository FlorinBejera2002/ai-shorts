'use client'

import { PlatformBrandIcon } from '@/components/publishing/platform-brand-icon'
import { Button } from '@/components/ui/button'
import type { ScheduledPostRecord } from '@/lib/content-calendar'
import type { PublishingData } from '@/lib/publishing'
import { ArrowLeft, Pencil, Send, Trash2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useId } from 'react'
import { CalendarPostMedia } from './calendar-post-media'
import { safeTimeZone } from './calendar-utils'
import styles from './calendar-post-preview.module.css'

type CalendarPostPreviewProps = {
  post: ScheduledPostRecord
  publishingClips: PublishingData['clips']
  locale: string
  onEdit: (post: ScheduledPostRecord) => void
  onPublish: (post: ScheduledPostRecord) => void
  onDelete: (post: ScheduledPostRecord) => void
  onStatus: (post: ScheduledPostRecord) => void
  onBack: () => void
  backLabel: string
}

export function CalendarPostPreview({
  post,
  publishingClips,
  locale,
  onEdit,
  onPublish,
  onDelete,
  onStatus,
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
    timeZone
  }).format(scheduledAt)
  const timeLabel = new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone
  }).format(scheduledAt)
  const viewStatus = post.status === 'publishing' || post.status === 'published'
  const editable = !viewStatus
  const deletable = post.status !== 'publishing'

  return (
    <section
      className={styles.preview}
      aria-labelledby={titleId}
      data-post-preview={post.id}
    >
      <div className={styles.mobileActions}>
        <button type="button" className={styles.back} onClick={onBack}>
          <ArrowLeft className="size-5" aria-hidden="true" />
          <span className="sr-only">{backLabel}</span>
        </button>
        {deletable && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={styles.mobileDelete}
            onClick={() => onDelete(post)}
            aria-label={t('actions.delete')}
          >
            <Trash2 className="size-4" />
          </Button>
        )}
      </div>
      <div className={styles.media}>
        <CalendarPostMedia
          key={post.id}
          post={post}
          publishingClips={publishingClips}
        />
      </div>
      <h2 id={titleId} className={styles.title}>
        {post.title}
      </h2>
      <div className={styles.schedule}>
        {post.status === 'draft' ? (
          <span>{t('publishing.undated')}</span>
        ) : (
          <time dateTime={post.scheduledAt} title={timeZone}>
            {dateLabel} · {timeLabel}
          </time>
        )}
      </div>
      <div className={styles.platforms}>
        {post.platforms.map((platform) => (
          <span
            key={platform}
            className={styles.platform}
            title={t(`platforms.${platform}`)}
          >
            <PlatformBrandIcon
              provider={platform}
              className={styles.platformIcon}
            />
            <span className="sr-only">{t(`platforms.${platform}`)}</span>
          </span>
        ))}
      </div>
      {post.status === 'failed' && (
        <div className={styles.error} role="status">
          {post.publishingError && <p>{post.publishingError}</p>}
          <Button
            type="button"
            variant="link"
            size="sm"
            className="h-auto px-0 pt-2 text-xs text-foreground"
            onClick={() => onStatus(post)}
          >
            {t('preview.viewStatus')}
          </Button>
        </div>
      )}
      <div className={styles.actions}>
        <Button
          type="button"
          variant="outline"
          className={styles.edit}
          onClick={() => onEdit(post)}
        >
          <Pencil className="size-4" aria-hidden="true" />
          {viewStatus ? t('preview.viewStatus') : t('publishing.editPost')}
        </Button>
        {editable && (
          <Button
            type="button"
            onClick={() => onPublish(post)}
            className={styles.publish}
            aria-label={t('composer.publishNow')}
          >
            <Send className={styles.publishIcon} aria-hidden="true" />
            <span className={styles.publishLabel}>
              {t('composer.publishNow')}
            </span>
          </Button>
        )}
        {deletable && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={styles.desktopDelete}
            onClick={() => onDelete(post)}
            aria-label={t('actions.delete')}
          >
            <Trash2 className="size-4" />
          </Button>
        )}
      </div>
    </section>
  )
}
