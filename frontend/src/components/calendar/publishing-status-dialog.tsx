'use client'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { LoadingIndicator } from '@/components/ui/loading-indicator'
import { Progress } from '@/components/ui/progress'
import type {
  PublishingDestination,
  ScheduledPostRecord
} from '@/lib/content-calendar'
import { CheckCircle2, ExternalLink, Trash2, TriangleAlert } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'
import { PlatformMark } from './platform-mark'

const stageProgress: Record<PublishingDestination['status'], number> = {
  queued: 15,
  submitting: 35,
  processing: 65,
  finalizing: 85,
  published: 100,
  failed: 100,
  unknown: 100,
  cancelled: 100
}

function elapsedLabel(startedAt: string, now: number) {
  const elapsedSeconds = Math.max(
    0,
    Math.floor((now - new Date(startedAt).getTime()) / 1_000)
  )
  if (elapsedSeconds < 60) return `${elapsedSeconds}s`
  return `${Math.floor(elapsedSeconds / 60)}m ${elapsedSeconds % 60}s`
}

function isActive(status: PublishingDestination['status']) {
  return ['queued', 'submitting', 'processing', 'finalizing'].includes(status)
}

export function PublishingStatusDialog({
  post,
  onClose,
  onDelete
}: {
  post: ScheduledPostRecord
  onClose: () => void
  onDelete: () => void
}) {
  const t = useTranslations('contentCalendar.progress')
  const calendarT = useTranslations('contentCalendar')
  const [now, setNow] = useState(() => Date.now())
  const destinations = post.publishingDestinations ?? []
  const publishing = post.status === 'publishing'
  const hasPublishedLink = destinations.some(
    (destination) =>
      destination.status === 'published' && Boolean(destination.url)
  )

  useEffect(() => {
    if (!publishing) return
    const timer = window.setInterval(() => setNow(Date.now()), 1_000)
    return () => window.clearInterval(timer)
  }, [publishing])

  const progress =
    post.status === 'published'
      ? 100
      : destinations.length === 0
        ? publishing
          ? 15
          : 100
        : Math.round(
            destinations.reduce(
              (total, destination) =>
                total + stageProgress[destination.status],
              0
            ) / destinations.length
          )

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="rounded-md sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{post.title}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md border bg-muted/35 p-4">
            <div className="flex items-start gap-3">
              {publishing ? (
                <LoadingIndicator className="mt-0.5 h-5 w-5 shrink-0" />
              ) : post.status === 'published' ? (
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
              ) : (
                <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">
                  {publishing
                    ? t('publishingTitle')
                    : post.status === 'published'
                      ? t('publishedTitle')
                      : t('failedTitle')}
                </p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {publishing
                    ? t('publishingEstimate')
                    : post.status === 'published'
                      ? t(
                          hasPublishedLink
                            ? 'publishedDescription'
                            : 'publishedDescriptionNoLink'
                        )
                      : post.publishingError || t('failedDescription')}
                </p>
              </div>
            </div>
            {publishing && (
              <div className="mt-4 space-y-2">
                <Progress value={progress} aria-label={t('progressLabel')} />
                <p className="text-[11px] text-muted-foreground">
                  {t('elapsed', {
                    duration: elapsedLabel(
                      destinations[0]?.createdAt ?? post.updatedAt,
                      now
                    )
                  })}
                </p>
              </div>
            )}
          </div>

          {destinations.map((destination) => (
            <div
              key={`${destination.provider}-${destination.accountName}`}
              className="flex items-start gap-3 rounded-md border p-3"
            >
              <PlatformMark
                platform={destination.provider}
                label={calendarT(`platforms.${destination.provider}`)}
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="truncate text-sm font-semibold">
                    {destination.accountName}
                  </p>
                  <span className="text-[11px] font-semibold text-muted-foreground">
                    {t(`stages.${destination.status}`)}
                  </span>
                </div>
                {isActive(destination.status) && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t('destinationElapsed', {
                      duration: elapsedLabel(destination.createdAt, now)
                    })}
                  </p>
                )}
                {destination.error && (
                  <p className="mt-1 text-xs text-destructive">
                    {destination.error}
                  </p>
                )}
                {destination.url && (
                  <Button
                    asChild={true}
                    variant="outline"
                    size="sm"
                    className="mt-3"
                  >
                    <a
                      href={destination.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ExternalLink />
                      {t('openPost', {
                        provider: calendarT(`platforms.${destination.provider}`)
                      })}
                    </a>
                  </Button>
                )}
                {destination.status === 'published' && !destination.url && (
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {t(
                      destination.provider === 'tiktok'
                        ? 'tiktokPrivateLinkUnavailable'
                        : 'linkUnavailable'
                    )}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>

        <DialogFooter>
          {post.status !== 'publishing' && (
            <Button
              type="button"
              variant="ghost"
              onClick={onDelete}
              className="text-destructive hover:bg-destructive/[0.07] hover:text-destructive sm:mr-auto"
            >
              <Trash2 />
              {calendarT('actions.delete')}
            </Button>
          )}
          <Button type="button" variant="outline" onClick={onClose}>
            {t('close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
