'use client'

import { PlatformBrandIcon } from '@/components/publishing/platform-brand-icon'
import {
  CloseButton,
  OverlayDescription,
  OverlayTitle,
  ReferenceOverlay
} from '@/components/shared/reference-overlay'
import overlay from '@/components/shared/reference-ui.module.css'
import { useIsMobile } from '@/hooks/use-mobile'
import type {
  PublishingDestination,
  ScheduledPostRecord
} from '@/lib/content-calendar'
import { useTranslations } from 'next-intl'
import { CalendarPostThumbnail } from './calendar-post-media'
import styles from './publishing-status-dialog.module.css'

function isActive(status: PublishingDestination['status']) {
  return ['queued', 'submitting', 'processing', 'finalizing'].includes(status)
}

interface PublishingStatusDialogProps {
  post: ScheduledPostRecord
  onClose: () => void
  onDelete: () => void
  onEdit?: () => void
}

export function PublishingStatusDialog({
  post,
  onClose,
  onDelete,
  onEdit
}: PublishingStatusDialogProps) {
  const t = useTranslations('contentCalendar.progress')
  const calendarT = useTranslations('contentCalendar')
  const mobile = useIsMobile()
  const publishing = post.status === 'publishing'
  const published = post.status === 'published'
  const failed = post.status === 'failed'
  const title = t(
    publishing ? 'publishingTitle' : published ? 'publishedTitle' : 'failedTitle'
  )
  const destinations: PublishingDestination[] = post.publishingDestinations?.length
    ? post.publishingDestinations
    : post.platforms.map((provider) => ({
        provider,
        accountName: calendarT(`platforms.${provider}`),
        status: publishing ? 'queued' : published ? 'published' : 'failed',
        createdAt: post.updatedAt,
        updatedAt: post.updatedAt
      }))

  return (
    <ReferenceOverlay open mobile={mobile} onClose={onClose}>
      <CloseButton onClick={onClose} />
      <div className={overlay.dialogHead}>
        <div className={styles.media}>
          <CalendarPostThumbnail post={post} />
        </div>
        <OverlayTitle mobile={mobile}>{title}</OverlayTitle>
        <OverlayDescription mobile={mobile}>{post.title}</OverlayDescription>
      </div>
      {post.publishingError && failed && (
        <p className={styles.error} role="alert">
          {post.publishingError}
        </p>
      )}
      <ul className={styles.destinations}>
        {destinations.map((destination) => (
          <li
            key={`${destination.provider}-${destination.accountName}`}
            className={styles.destination}
          >
            <PlatformBrandIcon
              provider={destination.provider}
              className={styles.destinationIcon}
            />
            <div className={styles.destinationBody}>
              <div className={styles.destinationLabel}>
                <span title={destination.accountName}>
                  {destination.accountName}
                </span>
                <span data-status={destination.status}>
                  {t(`stages.${destination.status}`)}
                </span>
              </div>
              {isActive(destination.status) && (
                <div
                  className={styles.progress}
                  role="progressbar"
                  aria-label={t('progressLabel')}
                  aria-valuetext={t(`stages.${destination.status}`)}
                >
                  <span />
                </div>
              )}
              {destination.error && (
                <p className={styles.destinationError}>{destination.error}</p>
              )}
              {destination.status === 'published' && !destination.url && (
                <p className={styles.note}>
                  {t(
                    destination.provider === 'tiktok'
                      ? 'tiktokPrivateLinkUnavailable'
                      : 'linkUnavailable'
                  )}
                </p>
              )}
            </div>
            {destination.url && (
              <a
                href={destination.url}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.link}
                aria-label={t('openPost', {
                  provider: calendarT(`platforms.${destination.provider}`)
                })}
              >
                <span aria-hidden="true">↗</span>
              </a>
            )}
          </li>
        ))}
      </ul>
      <div className={styles.actions}>
        {!publishing && !published ? (
          <>
            <button
              type="button"
              className={`${overlay.button} ${overlay.focus} ${styles.delete}`}
              onClick={onDelete}
            >
              {calendarT('actions.delete')}
            </button>
            {onEdit && (
              <button
                type="button"
                className={`${overlay.button} ${overlay.primary} ${overlay.focus}`}
                onClick={onEdit}
              >
                {calendarT('actions.edit')}
              </button>
            )}
          </>
        ) : (
          <button
            type="button"
            className={`${overlay.button} ${overlay.primary} ${overlay.focus} ${styles.closeAction}`}
            onClick={onClose}
          >
            {t('close')}
          </button>
        )}
      </div>
    </ReferenceOverlay>
  )
}
