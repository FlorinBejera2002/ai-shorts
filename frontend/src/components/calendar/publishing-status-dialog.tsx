'use client'

import { PlatformBrandIcon } from '@/components/publishing/platform-brand-icon'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import type { PublishingDestination, ScheduledPostRecord } from '@/lib/content-calendar'
import { ArrowUp, Check, ExternalLink, TriangleAlert, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import styles from './publishing-status-dialog.module.css'
import theme from './publishing-theme.module.css'

function isActive(status: PublishingDestination['status']) {
  return ['queued', 'submitting', 'processing', 'finalizing'].includes(status)
}

interface PublishingStatusDialogProps {
  post: ScheduledPostRecord
  onClose: () => void
  onDelete: () => void
  onEdit?: () => void
}

export function PublishingStatusDialog({ post, onClose, onDelete, onEdit }: PublishingStatusDialogProps) {
  const t = useTranslations('contentCalendar.progress')
  const calendarT = useTranslations('contentCalendar')
  const publishing = post.status === 'publishing'
  const published = post.status === 'published'
  const title = t(publishing ? 'publishingTitle' : published ? 'publishedTitle' : 'failedTitle')
  const destinations: PublishingDestination[] = post.publishingDestinations?.length
    ? post.publishingDestinations
    : post.platforms.map(provider => ({
      provider,
      accountName: calendarT('platforms.' + provider),
      status: publishing ? 'queued' : published ? 'published' : 'failed',
      createdAt: post.updatedAt,
      updatedAt: post.updatedAt
    }))

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose() }}>
      <DialogContent className={`${theme.surface} ${styles.dialog}`} overlayClassName={theme.overlay} data-publish-surface="" data-publishing-status="" data-publishing-state={post.status}>
        <Button type="button" variant="ghost" size="icon" className={styles.close} onClick={onClose} aria-label={t('close')}>
          <X className="size-4" />
        </Button>
        <header className={styles.header}>
          <span className={styles.symbol} data-status={post.status} aria-hidden="true">
            {publishing ? <ArrowUp /> : published ? <Check /> : <TriangleAlert />}
          </span>
          <DialogTitle className={styles.title}>{title}</DialogTitle>
          <DialogDescription className={styles.description}>{post.title}</DialogDescription>
        </header>
        {post.publishingError && !publishing && !published && (
          <p className={styles.error} role="alert">{post.publishingError}</p>
        )}
        <ul className={styles.destinations}>
          {destinations.map((destination, index) => (
            <li key={destination.provider + '-' + destination.accountName + '-' + index} className={styles.destination}>
              <PlatformBrandIcon provider={destination.provider} className="size-7" />
              <div className={styles.destinationBody}>
                <div className={styles.destinationLabel}>
                  <span title={destination.accountName}>{destination.accountName}</span>
                  <span data-status={destination.status}>{t('stages.' + destination.status)}</span>
                </div>
                {isActive(destination.status) && (
                  <div className={styles.progress} role="progressbar" aria-label={t('progressLabel')} aria-valuetext={t('stages.' + destination.status)}>
                    <span />
                  </div>
                )}
                {destination.error && <p className={styles.destinationError}>{destination.error}</p>}
                {destination.status === 'published' && !destination.url && (
                  <p className={styles.note}>{t(destination.provider === 'tiktok' ? 'tiktokPrivateLinkUnavailable' : 'linkUnavailable')}</p>
                )}
              </div>
              {destination.url && (
                <Button asChild variant="ghost" size="icon" className={styles.link}>
                  <a href={destination.url} target="_blank" rel="noopener noreferrer" aria-label={t('openPost', { provider: calendarT('platforms.' + destination.provider) })}>
                    <ExternalLink className="size-4" />
                  </a>
                </Button>
              )}
            </li>
          ))}
        </ul>
        <footer className={styles.footer}>
          {!publishing && !published && (
            <>
              <Button type="button" variant="ghost" onClick={onDelete} className={styles.delete}>{calendarT('actions.delete')}</Button>
              {onEdit && <Button type="button" onClick={onEdit} className={styles.primary}>{calendarT('actions.edit')}</Button>}
            </>
          )}
          {(publishing || published || !onEdit) && <Button type="button" onClick={onClose} className={`${styles.primary} ${styles.closeAction}`}>{t('close')}</Button>}
        </footer>
      </DialogContent>
    </Dialog>
  )
}
