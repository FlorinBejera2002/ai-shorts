'use client'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import type { ScheduledPostRecord } from '@/lib/content-calendar'
import { CalendarClock, Edit3, FilterX, Paperclip, Plus } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useMemo } from 'react'
import { PlatformMarks, StatusPill } from './calendar-presentation'
import styles from './calendar-workspace.module.css'

export function CalendarAgenda({
  date,
  posts,
  rawPostCount,
  locale,
  filtersActive,
  onCreate,
  onEdit,
  onReschedule,
  onClearFilters
}: {
  date: Date
  posts: ScheduledPostRecord[]
  rawPostCount: number
  locale: string
  filtersActive: boolean
  onCreate: () => void
  onEdit: (post: ScheduledPostRecord) => void
  onReschedule: (post: ScheduledPostRecord) => void
  onClearFilters: () => void
}) {
  const t = useTranslations('contentCalendar')
  const dateFormatter = useMemo(
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
  const hiddenByFilters =
    filtersActive && rawPostCount > 0 && posts.length === 0

  return (
    <Card as="aside" className={`${styles.agenda} block gap-0 p-5`}>
      <div className="border-b pb-5">
        <p className="section-label">{t('agenda.eyebrow')}</p>
        <div className="mt-2 flex items-start justify-between gap-3">
          <div>
            <h2 className="capitalize">{dateFormatter.format(date)}</h2>
            <p className="mt-1 text-xs">
              {t('postCount', { count: posts.length })}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={onCreate}
            className="shrink-0"
          >
            <Plus className="h-3.5 w-3.5" />
            {t('actions.addToDay')}
          </Button>
        </div>
      </div>

      {posts.length === 0 ? (
        <div className="flex min-h-56 flex-col items-center justify-center text-center">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            {hiddenByFilters ? (
              <FilterX className="h-4 w-4" />
            ) : (
              <CalendarClock className="h-4 w-4" />
            )}
          </span>
          <h3 className="mt-3 text-sm font-semibold">
            {t(hiddenByFilters ? 'agenda.filteredTitle' : 'agenda.emptyTitle')}
          </h3>
          <p className="mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground">
            {t(
              hiddenByFilters
                ? 'agenda.filteredDescription'
                : 'agenda.emptyDescription'
            )}
          </p>
          {hiddenByFilters && (
            <button
              type="button"
              onClick={onClearFilters}
              className="mt-3 text-xs font-semibold text-primary hover:underline"
            >
              {t('actions.clearFilters')}
            </button>
          )}
        </div>
      ) : (
        <div className="mt-4 space-y-2.5">
          {posts.map((post) => (
            <article
              key={post.id}
              className="border border-border bg-background p-3"
            >
              <div className="flex items-start gap-3">
                <div className="w-11 shrink-0 text-[10px] font-bold tabular-nums text-primary">
                  {timeFormatter.format(new Date(post.scheduledAt))}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-xs font-semibold">
                    {post.title}
                  </h3>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <StatusPill status={post.status} />
                    <PlatformMarks platforms={post.platforms} />
                  </div>
                </div>
              </div>
              {post.caption && (
                <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                  {post.caption}
                </p>
              )}
              {post.clip && (
                <div className="mt-2 inline-flex max-w-full items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-[10px] text-muted-foreground">
                  <Paperclip className="h-3 w-3 shrink-0" />
                  <span className="truncate">{post.clip.title}</span>
                  <strong className="text-primary">
                    {post.clip.viralScore}/10
                  </strong>
                </div>
              )}
              <div className="mt-3 flex justify-end gap-1 border-t border-border pt-2">
                {post.status !== 'published' && (
                  <button
                    type="button"
                    onClick={() => onReschedule(post)}
                    className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-[10px] font-semibold text-muted-foreground hover:bg-primary/[0.07] hover:text-primary"
                  >
                    <CalendarClock className="h-3 w-3" />
                    {t('actions.reschedule')}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onEdit(post)}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-[10px] font-semibold text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <Edit3 className="h-3 w-3" />
                  {t('actions.edit')}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </Card>
  )
}
