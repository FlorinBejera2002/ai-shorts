'use client'

import type { ScheduledPostRecord } from '@/lib/content-calendar'
import type { PublishingAccount } from '@/lib/publishing'
import {
  AlertCircle,
  ArrowUpRight,
  CalendarClock,
  CheckCircle2,
  CircleDashed,
  Film,
  ImageOff,
  LoaderCircle,
  Send
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useMemo } from 'react'
import {
  PlatformMarks,
  StatusPill,
  statusStyles
} from './calendar-presentation'
import styles from './calendar-workspace.module.css'

const statusOrder: Record<ScheduledPostRecord['status'], number> = {
  publishing: 0,
  scheduled: 1,
  draft: 2,
  failed: 3,
  published: 4
}

function sortPosts(posts: ScheduledPostRecord[]) {
  return [...posts].sort((left, right) => {
    const statusDifference =
      statusOrder[left.status] - statusOrder[right.status]
    if (statusDifference !== 0) return statusDifference
    const leftTime = new Date(left.scheduledAt).getTime()
    const rightTime = new Date(right.scheduledAt).getTime()
    return left.status === 'scheduled'
      ? leftTime - rightTime
      : rightTime - leftTime
  })
}

function PostStatusSummary({
  post,
  dateTime
}: {
  post: ScheduledPostRecord
  dateTime: Intl.DateTimeFormat
}) {
  const t = useTranslations('contentCalendar.preview')

  if (post.status === 'scheduled') {
    return (
      <span className="inline-flex items-center gap-1.5 font-semibold text-foreground">
        <CalendarClock className="size-3.5" />
        {t('scheduledFor', {
          date: dateTime.format(new Date(post.scheduledAt))
        })}
      </span>
    )
  }

  if (post.status === 'publishing') {
    return (
      <span className="inline-flex items-center gap-1.5 font-semibold text-foreground">
        <LoaderCircle className="size-3.5 animate-spin" />
        {t('publishingNow')}
      </span>
    )
  }

  if (post.status === 'failed') {
    return (
      <span className="inline-flex min-w-0 items-center gap-1.5 font-semibold text-destructive">
        <AlertCircle className="size-3.5 shrink-0" />
        <span className="truncate">
          {post.publishingError || t('needsAttention')}
        </span>
      </span>
    )
  }

  if (post.status === 'published') {
    return (
      <span className="inline-flex items-center gap-1.5 font-semibold text-success">
        <CheckCircle2 className="size-3.5" />
        {t('publishedOn', {
          date: dateTime.format(new Date(post.updatedAt))
        })}
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-1.5 font-medium text-muted-foreground">
      <CircleDashed className="size-3.5" />
      {t('draftHint')}
    </span>
  )
}

export function CalendarPreviewList({
  posts,
  accounts,
  locale,
  onCreatePost,
  onOpenPost
}: {
  posts: ScheduledPostRecord[]
  accounts: PublishingAccount[]
  locale: string
  onCreatePost: () => void
  onOpenPost: (post: ScheduledPostRecord) => void
}) {
  const t = useTranslations('contentCalendar')
  const orderedPosts = useMemo(() => sortPosts(posts), [posts])
  const accountNames = useMemo(
    () =>
      new Map(
        accounts.map((account) => [
          account.id,
          account.username ? `@${account.username}` : account.name
        ])
      ),
    [accounts]
  )
  const dateTime = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
      }),
    [locale]
  )

  if (orderedPosts.length === 0) {
    return (
      <div className="flex min-h-96 flex-col items-center justify-center px-6 py-16 text-center">
        <span className="inline-flex size-12 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <ImageOff className="size-5" />
        </span>
        <h3 className="mt-4 text-sm font-semibold">
          {t('preview.emptyTitle')}
        </h3>
        <p className="mt-1 max-w-sm text-xs leading-5 text-muted-foreground">
          {t('preview.emptyDescription')}
        </p>
        <button
          type="button"
          onClick={onCreatePost}
          className="mt-5 inline-flex h-9 items-center justify-center rounded-md bg-foreground px-4 text-xs font-semibold text-background transition-opacity hover:opacity-85"
        >
          {t('actions.newPost')}
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-3 border-t p-4 sm:p-5">
      <div className="flex items-end justify-between gap-4 pb-1">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
            {t('preview.eyebrow')}
          </p>
          <h3 className="mt-1 text-base font-semibold">
            {t('preview.title', { count: orderedPosts.length })}
          </h3>
        </div>
      </div>

      {orderedPosts.map((post) => {
        const destinations = (post.accountIds ?? [])
          .map((accountId) => accountNames.get(accountId))
          .filter((name): name is string => Boolean(name))
        const readinessChecks = [
          Boolean(post.clip),
          Boolean(post.caption?.trim()),
          destinations.length > 0
        ]
        const readiness = Math.round(
          (readinessChecks.filter(Boolean).length / readinessChecks.length) *
            100
        )
        const needsSetup =
          (post.status === 'draft' || post.status === 'scheduled') &&
          destinations.length === 0

        return (
          <button
            key={post.id}
            type="button"
            onClick={() => onOpenPost(post)}
            aria-label={t('preview.openAria', { title: post.title })}
            className="group relative grid w-full gap-0 overflow-hidden rounded-md border bg-card text-left shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition-[border-color,box-shadow] hover:border-foreground/20 hover:shadow-[0_14px_34px_-24px_rgba(0,0,0,0.45)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/35 sm:grid-cols-[208px_minmax(0,1fr)]"
          >
            <span
              aria-hidden="true"
              className={`absolute bottom-2 left-0 top-2 z-20 w-0.5 rounded-full ${statusStyles[post.status].line}`}
            />

            <span
              className={`${styles.previewMedia} relative flex min-h-40 items-center justify-center overflow-hidden bg-muted sm:min-h-44`}
            >
              {post.clip?.thumbnailUrl ? (
                <img
                  src={post.clip.thumbnailUrl}
                  alt={post.clip.title}
                  loading="lazy"
                  className="absolute inset-0 h-full w-full rounded-b-md object-cover sm:rounded-l-md sm:rounded-br-none"
                />
              ) : (
                <Film className="size-6 text-muted-foreground/60" />
              )}
              <span className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/80 via-black/35 to-transparent backdrop-blur-[1px] [mask-image:linear-gradient(to_top,black,transparent)]" />
              <span className="pointer-events-none absolute inset-x-0 bottom-0 h-10 backdrop-blur-[3px] [mask-image:linear-gradient(to_top,black,transparent)]" />
              <span className="absolute bottom-3 left-3.5">
                <PlatformMarks platforms={post.platforms} />
              </span>
            </span>

            <span className="flex min-w-0 flex-col p-4 sm:p-5 sm:pl-6">
              <span className="flex flex-wrap items-start justify-between gap-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-foreground sm:text-base">
                    {post.title}
                  </span>
                  {post.clip && (
                    <span className="mt-1 block truncate text-[11px] text-muted-foreground">
                      {post.clip.title}
                    </span>
                  )}
                </span>
                <span className="flex items-center gap-2">
                  {post.status === 'draft' && (
                    <span className="hidden text-[10px] font-semibold tabular-nums text-muted-foreground lg:inline">
                      {t('preview.readiness', { percent: readiness })}
                    </span>
                  )}
                  <StatusPill
                    status={post.status}
                    message={post.publishingError}
                  />
                </span>
              </span>

              <span className="mt-3 line-clamp-2 min-h-10 text-xs leading-5 text-muted-foreground">
                {post.caption || t('preview.noCaption')}
              </span>

              <span className="mt-auto grid gap-2.5 pt-4 text-[11px] sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                <span className="grid min-w-0 gap-2">
                  {needsSetup ? (
                    <span className="inline-flex items-center gap-1.5 font-semibold text-destructive">
                      <AlertCircle className="size-3.5" />
                      {t('preview.completeSetup')}
                    </span>
                  ) : (
                    <PostStatusSummary post={post} dateTime={dateTime} />
                  )}
                  <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
                    <Send className="size-3.5 shrink-0" />
                    {destinations.length > 0 ? (
                      <span className="truncate">
                        {t('preview.destinations', {
                          count: destinations.length,
                          names: destinations.join(', ')
                        })}
                      </span>
                    ) : (
                      <span>{t('preview.noDestinations')}</span>
                    )}
                  </span>
                </span>
                <span className="relative ml-auto inline-flex h-8 items-center gap-1.5 overflow-hidden rounded-md border border-border bg-background px-3 text-[10px] font-bold text-foreground shadow-sm before:absolute before:inset-0 before:origin-left before:scale-x-0 before:bg-foreground before:transition-transform before:duration-300 before:ease-out group-hover:before:scale-x-100 motion-reduce:before:transition-none">
                  <span className="relative z-10 transition-colors duration-200 group-hover:text-background">
                    {post.status === 'publishing' || post.status === 'published'
                      ? t('preview.viewStatus')
                      : t('preview.edit')}
                  </span>
                  <ArrowUpRight className="relative z-10 size-3 transition-[color,transform] duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-background motion-reduce:transition-none" />
                </span>
              </span>
            </span>
          </button>
        )
      })}
    </div>
  )
}
