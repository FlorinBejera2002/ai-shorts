'use client'

import type { ScheduledPostRecord } from '@/lib/content-calendar'
import { CalendarPlus, Clock3, Edit3, Paperclip } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useMemo } from 'react'
import { PlatformMarks, StatusPill } from './calendar-presentation'
import { groupPostsByLocalDay, localDateKey } from './calendar-utils'

export function CalendarListView({
  days,
  posts,
  locale,
  onCreateDate,
  onEditPost
}: {
  days: Date[]
  posts: ScheduledPostRecord[]
  locale: string
  onCreateDate: (date: Date) => void
  onEditPost: (post: ScheduledPostRecord) => void
}) {
  const t = useTranslations('contentCalendar')
  const grouped = useMemo(() => groupPostsByLocalDay(posts), [posts])
  const populatedDays = days.filter((day) => grouped.has(localDateKey(day)))
  const dayFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        weekday: 'long',
        month: 'long',
        day: 'numeric'
      }),
    [locale]
  )
  const timeFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }),
    [locale]
  )

  if (populatedDays.length === 0) {
    return (
      <div className="flex min-h-80 flex-col items-center justify-center px-6 py-12 text-center">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-md bg-muted text-foreground">
          <CalendarPlus className="h-5 w-5" />
        </span>
        <h3 className="mt-4 text-sm font-semibold">{t('list.emptyTitle')}</h3>
        <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
          {t('list.emptyDescription')}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3 p-4 sm:p-5">
      {populatedDays.map((day) => {
        const dayPosts = grouped.get(localDateKey(day)) ?? []
        return (
          <section
            key={localDateKey(day)}
            className="grid gap-4 sm:grid-cols-[170px_minmax(0,1fr)]"
          >
            <div>
              <h3 className="text-xs font-bold capitalize text-foreground">
                {dayFormatter.format(day)}
              </h3>
              <p className="mt-1 text-[10px] font-medium text-muted-foreground">
                {t('postCount', { count: dayPosts.length })}
              </p>
              <button
                type="button"
                onClick={() => onCreateDate(day)}
                className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-semibold text-foreground hover:underline"
              >
                <CalendarPlus className="h-3.5 w-3.5" />
                {t('actions.addToDay')}
              </button>
            </div>
            <div className="space-y-1.5">
              {dayPosts.map((post) => (
                <button
                  key={post.id}
                  type="button"
                  onClick={() => onEditPost(post)}
                  className="group flex min-h-12 w-full flex-wrap items-center gap-x-3 gap-y-2 rounded-sm bg-muted/35 px-3 py-2 text-left transition-colors hover:bg-muted"
                >
                  <span className="flex w-14 shrink-0 items-center gap-1 text-[10px] font-semibold tabular-nums text-muted-foreground">
                    <Clock3 className="h-3 w-3" />
                    {timeFormatter.format(new Date(post.scheduledAt))}
                  </span>
                  <span className="min-w-[180px] flex-1 truncate text-xs font-semibold text-foreground">
                    {post.title}
                  </span>
                  <PlatformMarks platforms={post.platforms} />
                  {post.clip && (
                    <span className="hidden min-w-0 max-w-56 items-center gap-1 text-[10px] text-muted-foreground xl:inline-flex">
                      <Paperclip className="h-3 w-3 shrink-0" />
                      <span className="truncate">{post.clip.title}</span>
                    </span>
                  )}
                  <StatusPill
                    status={post.status}
                    message={post.publishingError}
                  />
                  <Edit3 className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                </button>
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}
