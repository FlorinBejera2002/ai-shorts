'use client'

import { PlatformBrandIcon } from '@/components/publishing/platform-brand-icon'
import type { ScheduledPostRecord } from '@/lib/content-calendar'
import type { PublishingData } from '@/lib/publishing'
import { ArrowLeft, CalendarDays, Pencil, Send, Trash2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useId } from 'react'
import { CalendarPostMedia } from './calendar-post-media'
import { CalendarStatusBadge } from './calendar-status-badge'
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
  const isDraft = post.status === 'draft'
  const zoneLabel =
    timeZone === 'Europe/Bucharest'
      ? t('preview.localTime')
      : timeZone.split('/').pop()?.replaceAll('_', ' ')

  return (
    <section
      className={styles.preview}
      aria-labelledby={titleId}
      data-post-preview={post.id}
    >
      <button
        type="button"
        className={styles.back}
        onClick={onBack}
        aria-label={backLabel}
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        <span>{t('publishing.backShort')}</span>
      </button>
      <div className={styles.media}>
        <CalendarPostMedia
          key={post.id}
          post={post}
          publishingClips={publishingClips}
        />
      </div>
      <div className={styles.titleRow}>
        <h2 id={titleId} className={styles.title}>
          {post.title}
        </h2>
        <CalendarStatusBadge status={post.status} className={styles.badge} />
      </div>
      <div className={styles.info}>
        <div className={styles.infoRow}>
          <CalendarDays className="size-5" aria-hidden="true" />
          {isDraft ? (
            <span>{t('publishing.undated')}</span>
          ) : (
            <time dateTime={post.scheduledAt} title={timeZone}>
              {dateLabel} · {timeLabel}
            </time>
          )}
          {!isDraft && (
            <span className={styles.zone}>{zoneLabel}</span>
          )}
        </div>
        <div className={styles.infoRow}>
          <span className={styles.platforms}>
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
              </span>
            ))}
          </span>
          <span className={styles.platformNames}>
            {post.platforms.map((platform) => t(`platforms.${platform}`)).join(', ')}
          </span>
        </div>
      </div>
      {post.status === 'failed' && (
        <div className={styles.error} role="status">
          {post.publishingError && <p>{post.publishingError}</p>}
          <button
            type="button"
            className={styles.errorLink}
            onClick={() => onStatus(post)}
          >
            {t('preview.viewStatus')}
          </button>
        </div>
      )}
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.edit}
          onClick={() => onEdit(post)}
          aria-label={viewStatus ? t('preview.viewStatus') : t('publishing.editPost')}
          title={viewStatus ? t('preview.viewStatus') : t('publishing.editPost')}
        >
          <Pencil className="size-4" aria-hidden="true" />
        </button>
        {editable && (
          <button
            type="button"
            className={styles.publish}
            onClick={() => onPublish(post)}
            aria-label={t('composer.publishNow')}
          >
            <Send className="size-4" aria-hidden="true" />
            <span>{t('composer.publishNow')}</span>
          </button>
        )}
        {deletable && (
          <button
            type="button"
            className={styles.remove}
            onClick={() => onDelete(post)}
            aria-label={t('actions.delete')}
            title={t('actions.delete')}
          >
            <Trash2 className="size-4" aria-hidden="true" />
            <span className={styles.removeLabel}>{t('actions.delete')}</span>
          </button>
        )}
      </div>
    </section>
  )
}
