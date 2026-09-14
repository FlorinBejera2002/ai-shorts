'use client'

import type { ScheduledPostRecord } from '@/lib/content-calendar'
import { useTranslations } from 'next-intl'
import { type KeyboardEvent, useMemo, useState } from 'react'
import {
  PlatformMarks,
  draggablePostData,
  readDraggedPostId,
  statusStyles
} from './calendar-presentation'
import {
  type CalendarDensity,
  type CalendarRange,
  getWeekdayLabels,
  groupPostsByLocalDay,
  isSameLocalDay,
  localDateKey,
  startOfLocalDay
} from './calendar-utils'
import styles from './calendar-workspace.module.css'

export function CalendarMonthView({
  month,
  range,
  posts,
  selectedDate,
  locale,
  weekStartsOn,
  density,
  onSelectDate,
  onCreateDate,
  onEditPost,
  onMovePost
}: {
  month: Date
  range: CalendarRange
  posts: ScheduledPostRecord[]
  selectedDate: Date
  locale: string
  weekStartsOn: 0 | 1
  density: CalendarDensity
  onSelectDate: (date: Date) => void
  onCreateDate: (date: Date) => void
  onEditPost: (post: ScheduledPostRecord) => void
  onMovePost: (postId: string, date: Date) => void
}) {
  const t = useTranslations('contentCalendar')
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const labels = useMemo(
    () => getWeekdayLabels(locale, weekStartsOn),
    [locale, weekStartsOn]
  )
  const grouped = useMemo(() => groupPostsByLocalDay(posts), [posts])
  const today = startOfLocalDay(new Date())
  const fullDate = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      }),
    [locale]
  )
  const time = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }),
    [locale]
  )
  const visibleLimit = density === 'compact' ? 2 : 3
  let lastMonthDayIndex = range.days.length - 1
  while (
    lastMonthDayIndex > 0 &&
    range.days[lastMonthDayIndex]?.getMonth() !== month.getMonth()
  ) {
    lastMonthDayIndex -= 1
  }
  const visibleWeekCount = Math.ceil((lastMonthDayIndex + 1) / 7)

  function handleDayKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    dayIndex: number
  ) {
    let targetIndex: number | null = null
    if (event.key === 'ArrowLeft') targetIndex = dayIndex - 1
    if (event.key === 'ArrowRight') targetIndex = dayIndex + 1
    if (event.key === 'ArrowUp') targetIndex = dayIndex - 7
    if (event.key === 'ArrowDown') targetIndex = dayIndex + 7
    if (event.key === 'Home') targetIndex = dayIndex - (dayIndex % 7)
    if (event.key === 'End') targetIndex = dayIndex + (6 - (dayIndex % 7))
    if (targetIndex === null) return
    const targetDate = range.days[targetIndex]
    if (!targetDate) return
    event.preventDefault()
    onSelectDate(targetDate)
    requestAnimationFrame(() => {
      document
        .querySelector<HTMLButtonElement>(
          `[data-calendar-day="${localDateKey(targetDate)}"]`
        )
        ?.focus()
    })
  }

  return (
    <div
      role="grid"
      aria-label={t('calendarGridLabel')}
      className={`${styles.monthGrid} overflow-hidden bg-transparent`}
    >
      <div role="row" className="grid grid-cols-7 gap-1">
        {labels.map((label) => (
          <div
            role="columnheader"
            key={label}
            className="px-1 py-2 text-center text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground sm:text-[10px]"
          >
            <span className="hidden sm:inline">{label}</span>
            <span className="sm:hidden">{label.slice(0, 1)}</span>
          </div>
        ))}
      </div>

      {Array.from({ length: visibleWeekCount }, (_, weekIndex) => (
        <div role="row" key={weekIndex} className="mt-1 grid grid-cols-7 gap-1">
          {range.days
            .slice(weekIndex * 7, weekIndex * 7 + 7)
            .map((day, dayOffset) => {
              const key = localDateKey(day)
              const dayPosts = grouped.get(key) ?? []
              const dayIndex = weekIndex * 7 + dayOffset
              const selected = isSameLocalDay(day, selectedDate)
              const isToday = isSameLocalDay(day, today)
              const isCurrentMonth = day.getMonth() === month.getMonth()
              const isDropTarget = dropTarget === key

              if (!isCurrentMonth) {
                return (
                  <div
                    role="gridcell"
                    key={key}
                    aria-hidden="true"
                    className={`min-w-0 bg-muted/15 ${
                      density === 'compact'
                        ? 'min-h-[6rem] md:min-h-[7.5rem]'
                        : 'min-h-[7rem] md:min-h-[9.5rem]'
                    }`}
                  />
                )
              }

              return (
                <div
                  role="gridcell"
                  key={key}
                  onClick={() => onCreateDate(day)}
                  onDragOver={(event) => {
                    event.preventDefault()
                    event.dataTransfer.dropEffect = 'move'
                    setDropTarget(key)
                  }}
                  onDragLeave={() => setDropTarget(null)}
                  onDrop={(event) => {
                    event.preventDefault()
                    setDropTarget(null)
                    const postId = readDraggedPostId(event)
                    if (postId) onMovePost(postId, day)
                  }}
                  className={`relative min-w-0 bg-card p-1.5 transition-colors sm:p-2 ${
                    density === 'compact'
                      ? 'min-h-[6rem] md:min-h-[7.5rem]'
                      : 'min-h-[7rem] md:min-h-[9.5rem]'
                  } ${selected ? 'bg-muted/70' : ''} ${
                    isDropTarget
                      ? 'bg-muted ring-2 ring-inset ring-foreground/20'
                      : ''
                  }`}
                >
                  {selected && (
                    <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-foreground" />
                  )}
                  <button
                    type="button"
                    data-calendar-day={key}
                    tabIndex={selected ? 0 : -1}
                    aria-label={`${fullDate.format(day)}, ${t('postCount', { count: dayPosts.length })}`}
                    aria-pressed={selected}
                    onClick={(event) => {
                      event.stopPropagation()
                      onCreateDate(day)
                    }}
                    onKeyDown={(event) => handleDayKeyDown(event, dayIndex)}
                    className={`inline-flex h-7 min-w-7 items-center justify-center rounded-full px-1 text-[11px] font-semibold tabular-nums transition-colors sm:text-xs ${
                      isToday
                        ? 'bg-foreground text-background'
                        : selected
                          ? 'bg-background text-foreground shadow-sm'
                          : 'hover:bg-muted hover:text-foreground'
                    }`}
                  >
                    {day.getDate()}
                  </button>

                  <div className="mt-1.5 flex flex-wrap gap-1 md:hidden">
                    {dayPosts.slice(0, 3).map((post) => (
                      <button
                        key={post.id}
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation()
                          onEditPost(post)
                        }}
                        className="rounded-md"
                        aria-label={t('editPostAria', { title: post.title })}
                      >
                        <PlatformMarks
                          platforms={post.platforms}
                          compact={true}
                        />
                      </button>
                    ))}
                    {dayPosts.length > 3 && (
                      <span className="text-[9px] font-bold text-muted-foreground">
                        +{dayPosts.length - 3}
                      </span>
                    )}
                  </div>

                  <div className="mt-1.5 hidden space-y-1 md:block">
                    {dayPosts.slice(0, visibleLimit).map((post) => (
                      <button
                        key={post.id}
                        type="button"
                        draggable={post.status !== 'published'}
                        onDragStart={(event) => draggablePostData(event, post)}
                        onClick={(event) => {
                          event.stopPropagation()
                          onEditPost(post)
                        }}
                        aria-label={t('editPostAria', { title: post.title })}
                        className="group/event relative flex w-full items-center gap-1.5 overflow-hidden rounded-sm bg-muted/55 px-1.5 py-1 text-left transition-colors hover:bg-muted"
                      >
                        <span
                          aria-hidden="true"
                          className={`absolute inset-y-0 left-0 w-0.5 ${statusStyles[post.status].line}`}
                        />
                        <span className="ml-0.5 shrink-0 text-[9px] font-semibold tabular-nums text-muted-foreground">
                          {time.format(new Date(post.scheduledAt))}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[10px] font-semibold text-foreground">
                          {post.title}
                        </span>
                        <PlatformMarks
                          platforms={post.platforms}
                          compact={true}
                        />
                      </button>
                    ))}
                    {dayPosts.length > visibleLimit && (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation()
                          onSelectDate(day)
                        }}
                        className="px-1 text-[9px] font-bold text-foreground hover:underline"
                      >
                        {t('morePosts', {
                          count: dayPosts.length - visibleLimit
                        })}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
        </div>
      ))}
    </div>
  )
}
