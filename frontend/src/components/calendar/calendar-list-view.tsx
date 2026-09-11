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
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
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
    <div className="divide-y divide-border">
      {populatedDays.map((day) => {
        const dayPosts = grouped.get(localDateKey(day)) ?? []
        return (
          <section
            key={localDateKey(day)}
            className="grid gap-3 p-4 sm:grid-cols-[180px_1fr] sm:p-5"
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
                className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-semibold text-primary hover:underline"
              >
                <CalendarPlus className="h-3.5 w-3.5" />
                {t('actions.addToDay')}
              </button>
            </div>
            <div className="space-y-2">
              {dayPosts.map((post) => (
                <button
                  key={post.id}
                  type="button"
                  onClick={() => onEditPost(post)}
                  className="group flex w-full items-start gap-3 rounded-lg border border-border bg-background p-3 text-left transition-all hover:border-primary/30 hover:bg-primary/[0.025]"
                >
                  <span className="mt-0.5 flex w-14 shrink-0 items-center gap-1 text-[10px] font-semibold tabular-nums text-muted-foreground">
                    <Clock3 className="h-3 w-3" />
                    {timeFormatter.format(new Date(post.scheduledAt))}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-xs font-semibold text-foreground">
                        {post.title}
                      </span>
                      <StatusPill status={post.status} />
                    </span>
                    <span className="mt-2 flex flex-wrap items-center gap-2">
                      <PlatformMarks platforms={post.platforms} />
                      {post.clip && (
                        <span className="inline-flex min-w-0 items-center gap-1 text-[10px] text-muted-foreground">
                          <Paperclip className="h-3 w-3" />
                          <span className="truncate">{post.clip.title}</span>
                        </span>
                      )}
                    </span>
                  </span>
                  <Edit3 className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                </button>
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}
