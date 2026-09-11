'use client'

import type { ScheduledPostRecord } from '@/lib/content-calendar'
import { Clock3 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useMemo, useState } from 'react'
import {
  PlatformMarks,
  StatusPill,
  draggablePostData,
  readDraggedPostId,
  statusStyles
} from './calendar-presentation'
import type { CalendarDensity } from './calendar-utils'
import { isSameLocalDay, localDateKey, startOfLocalDay } from './calendar-utils'

const HOURS = Array.from({ length: 18 }, (_, index) => index + 6)

export function CalendarTimelineView({
  days,
  posts,
  selectedDate,
  locale,
  density,
  onSelectDate,
  onCreateAt,
  onEditPost,
  onMovePost
}: {
  days: Date[]
  posts: ScheduledPostRecord[]
  selectedDate: Date
  locale: string
  density: CalendarDensity
  onSelectDate: (date: Date) => void
  onCreateAt: (date: Date, hour: number) => void
  onEditPost: (post: ScheduledPostRecord) => void
  onMovePost: (postId: string, date: Date, hour: number) => void
}) {
  const t = useTranslations('contentCalendar')
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const today = startOfLocalDay(new Date())
  const dayFormatter = useMemo(
    () => new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric' }),
    [locale]
  )
  const timeFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }),
    [locale]
  )
  const postsBySlot = useMemo(() => {
    const result = new Map<string, ScheduledPostRecord[]>()
    for (const post of posts) {
      const date = new Date(post.scheduledAt)
      const key = `${localDateKey(date)}-${date.getHours()}`
      result.set(key, [...(result.get(key) ?? []), post])
    }
    return result
  }, [posts])
  const columns = `56px repeat(${days.length}, minmax(${days.length === 1 ? 280 : 112}px, 1fr))`

  return (
    <div className="max-h-[720px] overflow-auto bg-card">
      <div
        role="grid"
        aria-label={t('timeline.label')}
        className="min-w-max"
        style={{ display: 'grid', gridTemplateColumns: columns }}
      >
        <div className="sticky left-0 top-0 z-30 border-b border-r border-border bg-card" />
        {days.map((day) => {
          const selected = isSameLocalDay(day, selectedDate)
          const isToday = isSameLocalDay(day, today)
          return (
            <button
              key={localDateKey(day)}
              type="button"
              onClick={() => onSelectDate(day)}
              className={`sticky top-0 z-20 border-b border-r border-border px-3 py-3 text-center text-xs font-semibold capitalize backdrop-blur ${
                selected
                  ? 'bg-primary/[0.10] text-primary'
                  : 'bg-card/95 text-foreground'
              }`}
            >
              <span>{dayFormatter.format(day)}</span>
              {isToday && (
                <span className="ml-2 inline-block h-1.5 w-1.5 rounded-full bg-primary" />
              )}
            </button>
          )
        })}

        {HOURS.flatMap((hour) => [
          <div
            key={`time-${hour}`}
            className={`sticky left-0 z-10 border-b border-r border-border bg-muted/35 px-2 pt-2 text-right text-[10px] font-semibold tabular-nums text-muted-foreground ${
              density === 'compact' ? 'min-h-16' : 'min-h-24'
            }`}
          >
            {String(hour).padStart(2, '0')}:00
          </div>,
          ...days.map((day) => {
            const slotKey = `${localDateKey(day)}-${hour}`
            const slotPosts = postsBySlot.get(slotKey) ?? []
            const isDropTarget = dropTarget === slotKey
            return (
              <div
                key={slotKey}
                role="gridcell"
                onDragOver={(event) => {
                  event.preventDefault()
                  event.dataTransfer.dropEffect = 'move'
                  setDropTarget(slotKey)
                }}
                onDragLeave={() => setDropTarget(null)}
                onDrop={(event) => {
                  event.preventDefault()
                  setDropTarget(null)
                  const postId = readDraggedPostId(event)
                  if (postId) onMovePost(postId, day, hour)
                }}
                onDoubleClick={() => onCreateAt(day, hour)}
                className={`border-b border-r border-border p-1.5 transition-colors ${
                  density === 'compact' ? 'min-h-16' : 'min-h-24'
                } ${
                  isDropTarget
                    ? 'bg-primary/[0.10] ring-2 ring-inset ring-primary/30'
                    : 'bg-card hover:bg-muted/20'
                }`}
              >
                <div className="space-y-1.5">
                  {slotPosts.map((post) => (
                    <button
                      key={post.id}
                      type="button"
                      draggable={post.status !== 'published'}
                      onDragStart={(event) => draggablePostData(event, post)}
                      onClick={() => onEditPost(post)}
                      className={`relative flex w-full items-start gap-2 overflow-hidden rounded-lg border border-border bg-background p-2 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md ${
                        days.length === 1 ? 'sm:p-3' : ''
                      }`}
                    >
                      <span
                        className={`absolute inset-y-0 left-0 w-0.5 ${statusStyles[post.status].line}`}
                      />
                      <PlatformMarks
                        platforms={post.platforms}
                        compact={true}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1 text-[9px] font-semibold tabular-nums text-muted-foreground">
                          <Clock3 className="h-3 w-3" />
                          {timeFormatter.format(new Date(post.scheduledAt))}
                        </span>
                        <span className="mt-1 block truncate text-[11px] font-semibold text-foreground">
                          {post.title}
                        </span>
                        {days.length === 1 && post.caption && (
                          <span className="mt-1 hidden line-clamp-2 text-[11px] leading-relaxed text-muted-foreground sm:block">
                            {post.caption}
                          </span>
                        )}
                      </span>
                      {days.length === 1 && <StatusPill status={post.status} />}
                    </button>
                  ))}
                </div>
              </div>
            )
          })
        ])}
      </div>
    </div>
  )
}
