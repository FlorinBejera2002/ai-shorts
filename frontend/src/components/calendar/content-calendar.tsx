'use client'

import { apiFetch } from '@/lib/auth'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'

import { PageHeader } from '@/components/ui/page-header'
import { useToast } from '@/components/ui/toast'
import type {
  CalendarClipOption,
  ContentPlatform,
  ContentPostStatus,
  ScheduledPostRecord
} from '@/lib/content-calendar'
import { motion, useReducedMotion } from 'framer-motion'
import {
  AlertCircle,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Edit3,
  FileClock,
  FilterX,
  Loader2,
  Paperclip,
  Plus,
  RefreshCw
} from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react'
import {
  type CalendarRange,
  CalendarRequestError,
  type PostFormPayload,
  addLocalMonths,
  getCalendarRange,
  getWeekdayLabels,
  groupPostsByLocalDay,
  isInRange,
  isSameLocalDay,
  localDateKey,
  safeTimeZone,
  startOfLocalDay,
  startOfLocalMonth
} from './calendar-utils'
import styles from './calendar-workspace.module.css'
import { PlatformMark } from './platform-mark'
import { PostDialog } from './post-dialog'

type CalendarResponse = {
  posts: ScheduledPostRecord[]
  clips: CalendarClipOption[]
  meta?: {
    truncated: boolean
    limit: number
  }
}

type PostResponse = { post: ScheduledPostRecord }
type LoadErrorKey = 'auth' | 'rateLimit' | 'load'
type PlatformFilter = ContentPlatform | 'all'
type StatusFilter = ContentPostStatus | 'all'
type DialogState =
  | { mode: 'create' }
  | { mode: 'edit' | 'reschedule'; post: ScheduledPostRecord }
  | null

const statusStyles = {
  draft: {
    pill: 'border-border bg-muted text-muted-foreground',
    line: 'bg-muted-foreground'
  },
  scheduled: {
    pill: 'border-primary/20 bg-primary/[0.08] text-primary',
    line: 'bg-primary'
  },
  published: {
    pill: 'border-success/20 bg-success/10 text-success',
    line: 'bg-success'
  }
} satisfies Record<ContentPostStatus, { pill: string; line: string }>

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

async function requestJson<Response>(
  url: string,
  init?: RequestInit
): Promise<Response> {
  const response = await apiFetch(url, init)
  const body: unknown = await response.json().catch(() => null)

  if (!response.ok) {
    const message =
      isObject(body) && typeof body.error === 'string'
        ? body.error
        : 'Calendar request failed'
    const issues =
      isObject(body) && Array.isArray(body.issues)
        ? body.issues.filter(
            (issue): issue is { field: string; message: string } =>
              isObject(issue) &&
              typeof issue.field === 'string' &&
              typeof issue.message === 'string'
          )
        : []
    throw new CalendarRequestError(message, response.status, issues)
  }

  return body as Response
}

function StatusPill({ status }: { status: ContentPostStatus }) {
  const t = useTranslations('contentCalendar')
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] font-bold ${statusStyles[status].pill}`}
    >
      <span
        aria-hidden="true"
        className={`h-1.5 w-1.5 rounded-full ${statusStyles[status].line}`}
      />
      {t(`statuses.${status}`)}
    </span>
  )
}

function CalendarSkeleton() {
  const t = useTranslations('contentCalendar')
  return (
    <div aria-label={t('loading')} className="mt-7 space-y-4" aria-busy="true">
      <div className={styles.metrics}>
        {Array.from({ length: 4 }, (_, index) => (
          <Card
            key={index}
            className="block gap-0 py-0 flex items-center gap-3 p-4"
          >
            <div className="skeleton h-10 w-10 rounded-xl" />
            <div className="flex-1 space-y-2">
              <div className="skeleton h-2.5 w-2/3" />
              <div className="skeleton h-6 w-12" />
            </div>
          </Card>
        ))}
      </div>
      <Card className="block gap-0 py-0 overflow-hidden p-4 sm:p-5">
        <div className="flex items-center justify-between gap-4">
          <div className="skeleton h-10 w-40" />
          <div className="skeleton h-10 w-52" />
        </div>
        <div className="mt-5 grid grid-cols-7 gap-px overflow-hidden rounded-xl bg-border p-px">
          {Array.from({ length: 42 }, (_, index) => (
            <div key={index} className="min-h-20 bg-card p-2 md:min-h-28">
              <div className="skeleton h-5 w-5 rounded-full" />
              {index % 4 === 0 && (
                <div className="skeleton mt-4 hidden h-7 w-full md:block" />
              )}
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}

function Metrics({
  posts,
  month
}: { posts: ScheduledPostRecord[]; month: Date }) {
  const t = useTranslations('contentCalendar')
  const monthPosts = posts.filter((post) => {
    const date = new Date(post.scheduledAt)
    return (
      date.getFullYear() === month.getFullYear() &&
      date.getMonth() === month.getMonth()
    )
  })

  const items = [
    {
      label: t('metrics.total'),
      value: monthPosts.length,
      icon: CalendarDays,
      className: 'bg-primary/10 text-primary'
    },
    {
      label: t('metrics.scheduled'),
      value: monthPosts.filter((post) => post.status === 'scheduled').length,
      icon: Clock3,
      className: 'bg-sky-500/10 text-sky-600 dark:text-sky-400'
    },
    {
      label: t('metrics.published'),
      value: monthPosts.filter((post) => post.status === 'published').length,
      icon: CheckCircle2,
      className: 'bg-success/10 text-success'
    },
    {
      label: t('metrics.drafts'),
      value: monthPosts.filter((post) => post.status === 'draft').length,
      icon: FileClock,
      className: 'bg-muted text-muted-foreground'
    }
  ]

  return (
    <section aria-label={t('metrics.label')} className={styles.metrics}>
      {items.map((item) => {
        const Icon = item.icon
        return (
          <Card key={item.label} className={styles.metric}>
            <span className={`${styles.metricIcon} ${item.className}`}>
              <Icon className="h-4 w-4" strokeWidth={1.8} />
            </span>
            <div className="min-w-0">
              <p className="section-label truncate">{item.label}</p>
              <p className="mt-1.5 text-xl font-semibold tabular-nums leading-none">
                {item.value}
              </p>
            </div>
          </Card>
        )
      })}
    </section>
  )
}

function CalendarGrid({
  month,
  range,
  posts,
  selectedDate,
  locale,
  weekStartsOn,
  onSelectDate,
  onEditPost
}: {
  month: Date
  range: CalendarRange
  posts: ScheduledPostRecord[]
  selectedDate: Date
  locale: string
  weekStartsOn: 0 | 1
  onSelectDate: (date: Date) => void
  onEditPost: (post: ScheduledPostRecord) => void
}) {
  const t = useTranslations('contentCalendar')
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
      new Intl.DateTimeFormat(locale, {
        hour: '2-digit',
        minute: '2-digit'
      }),
    [locale]
  )

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
    if (
      targetIndex === null ||
      targetIndex < 0 ||
      targetIndex >= range.days.length
    ) {
      return
    }

    event.preventDefault()
    const targetDate = range.days[targetIndex]
    if (!targetDate) return
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
      role="group"
      aria-label={t('calendarGridLabel')}
      className={`${styles.monthGrid} overflow-hidden border border-border bg-border`}
    >
      <div className="grid grid-cols-7 gap-px">
        {labels.map((label) => (
          <div
            key={label}
            className="bg-muted/65 px-1 py-2 text-center text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground sm:text-[10px]"
          >
            <span className="hidden sm:inline">{label}</span>
            <span className="sm:hidden">{label.slice(0, 1)}</span>
          </div>
        ))}
      </div>

      {Array.from({ length: 6 }, (_, weekIndex) => (
        <div key={weekIndex} className="mt-px grid grid-cols-7 gap-px">
          {range.days
            .slice(weekIndex * 7, weekIndex * 7 + 7)
            .map((day, dayOffset) => {
              const dayPosts = grouped.get(localDateKey(day)) ?? []
              const dayIndex = weekIndex * 7 + dayOffset
              const selected = isSameLocalDay(day, selectedDate)
              const isToday = isSameLocalDay(day, today)
              const isCurrentMonth = day.getMonth() === month.getMonth()

              return (
                <div
                  key={localDateKey(day)}
                  className={`relative min-h-[5.25rem] min-w-0 bg-card p-1.5 transition-colors sm:p-2 md:min-h-[8.25rem] ${
                    selected ? 'bg-primary/[0.055]' : ''
                  } ${isCurrentMonth ? '' : 'bg-muted/35 text-muted-foreground'}`}
                >
                  {selected && (
                    <span className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-primary" />
                  )}
                  <button
                    type="button"
                    data-calendar-day={localDateKey(day)}
                    tabIndex={selected ? 0 : -1}
                    aria-label={`${fullDate.format(day)}, ${t('postCount', {
                      count: dayPosts.length
                    })}`}
                    aria-pressed={selected}
                    onClick={() => onSelectDate(day)}
                    onKeyDown={(event) => handleDayKeyDown(event, dayIndex)}
                    className={`inline-flex h-7 min-w-7 items-center justify-center rounded-full px-1 text-[11px] font-semibold tabular-nums transition-colors sm:text-xs ${
                      isToday
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : selected
                          ? 'bg-primary/10 text-primary'
                          : 'hover:bg-muted hover:text-foreground'
                    } ${isCurrentMonth ? '' : 'opacity-60'}`}
                  >
                    {day.getDate()}
                  </button>

                  <div className="mt-1.5 flex flex-wrap gap-1 md:hidden">
                    {dayPosts.slice(0, 3).map((post) => (
                      <button
                        key={post.id}
                        type="button"
                        aria-label={t('editPostAria', { title: post.title })}
                        title={post.title}
                        onClick={() => onEditPost(post)}
                        className="inline-flex h-6 w-6 items-center justify-center rounded-md transition-transform hover:scale-105"
                      >
                        <PlatformMark
                          platform={post.platforms[0] ?? 'instagram'}
                          label={t(
                            `platforms.${post.platforms[0] ?? 'instagram'}`
                          )}
                        />
                      </button>
                    ))}
                    {dayPosts.length > 3 && (
                      <span className="inline-flex h-6 items-center text-[9px] font-bold text-muted-foreground">
                        +{dayPosts.length - 3}
                      </span>
                    )}
                  </div>

                  <div className="mt-1.5 hidden space-y-1 md:block">
                    {dayPosts.slice(0, 2).map((post) => (
                      <button
                        key={post.id}
                        type="button"
                        aria-label={t('editPostAria', { title: post.title })}
                        onClick={() => onEditPost(post)}
                        className="group/event relative flex w-full items-center gap-1.5 overflow-hidden rounded-md border border-border bg-background px-1.5 py-1 text-left shadow-sm transition-all hover:border-primary/30 hover:bg-primary/[0.04]"
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
                      </button>
                    ))}
                    {dayPosts.length > 2 && (
                      <button
                        type="button"
                        onClick={() => onSelectDate(day)}
                        className="px-1 text-[9px] font-bold text-primary hover:underline"
                      >
                        {t('morePosts', { count: dayPosts.length - 2 })}
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

function Agenda({
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
  const reduceMotion = useReducedMotion()
  const dateLabel = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        weekday: 'long',
        month: 'long',
        day: 'numeric'
      }).format(date),
    [date, locale]
  )
  const timeFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        hour: '2-digit',
        minute: '2-digit'
      }),
    [locale]
  )

  return (
    <Card
      as="section"
      aria-labelledby="selected-day-agenda"
      className={`${styles.agenda} block gap-0 py-0 p-4 sm:p-5`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
        <div>
          <p className="section-label">{t('agenda.eyebrow')}</p>
          <h2
            id="selected-day-agenda"
            className="mt-2 text-lg font-semibold capitalize sm:text-xl"
          >
            {dateLabel}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {t('postCount', { count: posts.length })}
          </p>
        </div>
        <Button type="button" onClick={onCreate} variant="outline" className="">
          <Plus className="h-4 w-4" />
          {t('actions.addToDay')}
        </Button>
      </div>

      {posts.length === 0 ? (
        <div className="flex min-h-52 flex-col items-center justify-center px-4 py-10 text-center">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-dashed border-primary/30 bg-primary/[0.05] text-primary">
            <CalendarClock className="h-5 w-5" strokeWidth={1.7} />
          </span>
          <h3 className="mt-4 text-sm font-semibold">
            {rawPostCount > 0
              ? t('agenda.filteredTitle')
              : t('agenda.emptyTitle')}
          </h3>
          <p className="mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground">
            {rawPostCount > 0
              ? t('agenda.filteredDescription')
              : t('agenda.emptyDescription')}
          </p>
          {rawPostCount > 0 && filtersActive ? (
            <button
              type="button"
              onClick={onClearFilters}
              className="mt-4 inline-flex items-center gap-2 text-xs font-semibold text-primary hover:underline"
            >
              <FilterX className="h-3.5 w-3.5" />
              {t('actions.clearFilters')}
            </button>
          ) : (
            <Button
              type="button"
              onClick={onCreate}
              variant="default"
              className="mt-5"
            >
              <Plus className="h-4 w-4" />
              {t('actions.create')}
            </Button>
          )}
        </div>
      ) : (
        <div className="mt-4 space-y-2.5">
          {posts.map((post, index) => (
            <motion.article
              key={post.id}
              initial={reduceMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.035, duration: 0.25 }}
              className="group relative overflow-hidden rounded-xl border border-border bg-background p-3.5 transition-colors hover:border-primary/25 sm:p-4"
            >
              <span
                aria-hidden="true"
                className={`absolute inset-y-0 left-0 w-1 ${statusStyles[post.status].line}`}
              />
              <div className="flex gap-3 sm:gap-4">
                <div className="w-14 shrink-0 border-r border-border pr-3 text-right sm:w-16">
                  <span className="text-sm font-bold tabular-nums text-foreground">
                    {timeFormatter.format(new Date(post.scheduledAt))}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-semibold text-foreground">
                        {post.title}
                      </h3>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <StatusPill status={post.status} />
                        {post.platforms.map((platform) => (
                          <PlatformMark
                            key={platform}
                            platform={platform}
                            label={t(`platforms.${platform}`)}
                            showLabel={true}
                          />
                        ))}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => onReschedule(post)}
                        aria-label={t('reschedulePostAria', {
                          title: post.title
                        })}
                        className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-semibold text-muted-foreground transition-colors hover:bg-primary/[0.07] hover:text-primary"
                      >
                        <CalendarClock className="h-3.5 w-3.5" />
                        <span className="hidden xl:inline">
                          {t('actions.reschedule')}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onEdit(post)}
                        aria-label={t('editPostAria', { title: post.title })}
                        className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                        <span className="hidden xl:inline">
                          {t('actions.edit')}
                        </span>
                      </button>
                    </div>
                  </div>

                  {post.caption && (
                    <p className="mt-2.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                      {post.caption}
                    </p>
                  )}
                  {post.clip && (
                    <div className="mt-2.5 inline-flex max-w-full items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-[10px] font-medium text-muted-foreground">
                      <Paperclip className="h-3 w-3 shrink-0" />
                      <span className="truncate">{post.clip.title}</span>
                      <span className="shrink-0 font-bold text-primary">
                        {post.clip.viralScore}/10
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </motion.article>
          ))}
        </div>
      )}
    </Card>
  )
}

export function ContentCalendar() {
  const t = useTranslations('contentCalendar')
  const locale = useLocale()
  const toast = useToast()
  const [ready, setReady] = useState(false)
  const [viewDate, setViewDate] = useState(() => new Date(0))
  const [selectedDate, setSelectedDate] = useState(() => new Date(0))
  const [timeZone, setTimeZone] = useState('UTC')
  const [posts, setPosts] = useState<ScheduledPostRecord[]>([])
  const [clips, setClips] = useState<CalendarClipOption[]>([])
  const [loading, setLoading] = useState(false)
  const [hasLoaded, setHasLoaded] = useState(false)
  const [loadError, setLoadError] = useState<LoadErrorKey | null>(null)
  const [truncatedLimit, setTruncatedLimit] = useState<number | null>(null)
  const [refreshToken, setRefreshToken] = useState(0)
  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [dialog, setDialog] = useState<DialogState>(null)
  const mutationRevisionRef = useRef(0)

  const weekStartsOn: 0 | 1 = locale.toLowerCase().startsWith('ro') ? 1 : 0
  const range = useMemo(
    () => getCalendarRange(viewDate, weekStartsOn),
    [viewDate, weekStartsOn]
  )
  const rangeStart = range.start.toISOString()
  const rangeEnd = range.end.toISOString()

  useEffect(() => {
    const now = new Date()
    setViewDate(startOfLocalMonth(now))
    setSelectedDate(startOfLocalDay(now))
    setTimeZone(safeTimeZone())
    setReady(true)
  }, [])

  // biome-ignore lint/correctness/useExhaustiveDependencies: refreshToken intentionally retries the current range.
  useEffect(() => {
    if (!ready) return
    const controller = new AbortController()
    const mutationRevisionAtStart = mutationRevisionRef.current

    async function loadCalendar() {
      setLoading(true)
      setLoadError(null)
      try {
        const query = new URLSearchParams({
          start: rangeStart,
          end: rangeEnd
        })
        const data = await requestJson<CalendarResponse>(
          `/api/calendar?${query}`,
          { signal: controller.signal, cache: 'no-store' }
        )
        if (!Array.isArray(data.posts) || !Array.isArray(data.clips)) {
          throw new CalendarRequestError('Invalid calendar response', 500)
        }
        setClips(data.clips)
        if (mutationRevisionAtStart === mutationRevisionRef.current) {
          setPosts(data.posts)
          setTruncatedLimit(
            data.meta?.truncated ? (data.meta.limit ?? 500) : null
          )
          setHasLoaded(true)
        }
      } catch (error) {
        if (controller.signal.aborted) return
        if (error instanceof CalendarRequestError && error.status === 401) {
          setLoadError('auth')
        } else if (
          error instanceof CalendarRequestError &&
          error.status === 429
        ) {
          setLoadError('rateLimit')
        } else {
          setLoadError('load')
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }

    loadCalendar()
    return () => controller.abort()
  }, [rangeEnd, rangeStart, ready, refreshToken])

  const visiblePosts = useMemo(
    () =>
      posts.filter(
        (post) =>
          (platformFilter === 'all' ||
            post.platforms.includes(platformFilter)) &&
          (statusFilter === 'all' || post.status === statusFilter)
      ),
    [platformFilter, posts, statusFilter]
  )
  const visibleGrouped = useMemo(
    () => groupPostsByLocalDay(visiblePosts),
    [visiblePosts]
  )
  const rawGrouped = useMemo(() => groupPostsByLocalDay(posts), [posts])
  const selectedKey = localDateKey(selectedDate)
  const selectedPosts = visibleGrouped.get(selectedKey) ?? []
  const rawSelectedCount = rawGrouped.get(selectedKey)?.length ?? 0
  const filtersActive = platformFilter !== 'all' || statusFilter !== 'all'

  function clearFilters() {
    setPlatformFilter('all')
    setStatusFilter('all')
  }

  function selectDate(date: Date) {
    const nextDate = startOfLocalDay(date)
    setSelectedDate(nextDate)
    if (
      nextDate.getMonth() !== viewDate.getMonth() ||
      nextDate.getFullYear() !== viewDate.getFullYear()
    ) {
      setPosts([])
      setHasLoaded(false)
      setLoading(true)
      setViewDate(startOfLocalMonth(nextDate))
    }
  }

  function navigateMonth(amount: number) {
    const nextMonth = addLocalMonths(viewDate, amount)
    setPosts([])
    setHasLoaded(false)
    setLoading(true)
    setViewDate(nextMonth)
    setSelectedDate(nextMonth)
  }

  function goToday() {
    const today = startOfLocalDay(new Date())
    if (
      today.getMonth() !== viewDate.getMonth() ||
      today.getFullYear() !== viewDate.getFullYear()
    ) {
      setPosts([])
      setHasLoaded(false)
      setLoading(true)
    }
    setViewDate(startOfLocalMonth(today))
    setSelectedDate(today)
  }

  function mergePost(post: ScheduledPostRecord) {
    setPosts((current) => {
      const withoutPost = current.filter((item) => item.id !== post.id)
      return isInRange(post.scheduledAt, range)
        ? [...withoutPost, post]
        : withoutPost
    })
  }

  async function saveDialogPost(payload: PostFormPayload) {
    if (!dialog) return
    let post: ScheduledPostRecord

    if (dialog.mode === 'create') {
      const data = await requestJson<PostResponse>('/api/calendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      post = data.post
      toast.add('success', t('toasts.created'))
    } else {
      const data = await requestJson<PostResponse>(
        `/api/calendar/${dialog.post.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }
      )
      post = data.post
      toast.add(
        'success',
        dialog.mode === 'reschedule'
          ? t('toasts.rescheduled')
          : t('toasts.updated')
      )
    }

    mutationRevisionRef.current += 1
    mergePost(post)
    setRefreshToken((current) => current + 1)
    const newDate = startOfLocalDay(new Date(post.scheduledAt))
    setSelectedDate(newDate)
    if (
      newDate.getMonth() !== viewDate.getMonth() ||
      newDate.getFullYear() !== viewDate.getFullYear()
    ) {
      setPosts([])
      setHasLoaded(false)
      setLoading(true)
      setViewDate(startOfLocalMonth(newDate))
    }
  }

  async function deleteDialogPost() {
    if (!dialog || dialog.mode === 'create') return
    await requestJson<{ deleted: boolean }>(`/api/calendar/${dialog.post.id}`, {
      method: 'DELETE'
    })
    mutationRevisionRef.current += 1
    setPosts((current) => current.filter((post) => post.id !== dialog.post.id))
    setRefreshToken((current) => current + 1)
    toast.add('success', t('toasts.deleted'))
  }

  const monthTitle = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        month: 'long',
        year: 'numeric'
      }).format(viewDate),
    [locale, viewDate]
  )

  return (
    <div className={styles.workspace}>
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          <Button
            type="button"
            disabled={!ready}
            onClick={() => setDialog({ mode: 'create' })}
            variant="default"
            className="disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Plus className="h-4 w-4" />
            {t('actions.newPost')}
          </Button>
        }
      />

      {!ready || (loading && !hasLoaded) ? (
        <CalendarSkeleton />
      ) : (
        <div className="mt-7 space-y-4">
          <Metrics posts={posts} month={viewDate} />

          {loadError && (
            <div
              role="alert"
              className="flex flex-wrap items-center gap-3 rounded-xl border border-destructive/25 bg-destructive/[0.055] px-4 py-3 text-sm text-destructive"
            >
              <AlertCircle className="h-4 w-4 shrink-0" />
              <p className="min-w-0 flex-1 text-xs font-medium">
                {t(`errors.${loadError}`)}
              </p>
              <button
                type="button"
                onClick={() => setRefreshToken((current) => current + 1)}
                className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-destructive/25 bg-card px-3 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                {t('actions.retry')}
              </button>
            </div>
          )}

          {truncatedLimit && (
            <div
              role="status"
              className="rounded-xl border border-warning/25 bg-warning/[0.07] px-4 py-3 text-xs font-medium text-warning"
            >
              {t('truncated', { count: truncatedLimit })}
            </div>
          )}

          <div className={styles.planningLayout}>
            <Card
              as="section"
              aria-label={t('calendarSectionLabel')}
              aria-busy={loading}
              className={`${styles.planner} block gap-0 py-0 overflow-hidden`}
            >
              <div
                className={`${styles.toolbar} border-b border-border p-4 sm:p-5`}
              >
                <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                  <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                    <Button
                      variant="outline"
                      type="button"
                      onClick={() => navigateMonth(-1)}
                      aria-label={t('actions.previousMonth')}
                      className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:border-input hover:bg-muted hover:text-foreground"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <div className="min-w-28 px-1 text-center sm:min-w-44">
                      <h2 className="text-lg font-semibold capitalize sm:text-xl">
                        {monthTitle}
                      </h2>
                    </div>
                    <Button
                      variant="outline"
                      type="button"
                      onClick={() => navigateMonth(1)}
                      aria-label={t('actions.nextMonth')}
                      className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:border-input hover:bg-muted hover:text-foreground"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      type="button"
                      onClick={goToday}
                      className="inline-flex min-h-10 items-center rounded-lg border border-border bg-card px-3 text-xs font-semibold text-foreground transition-colors hover:bg-muted sm:ml-1"
                    >
                      {t('actions.today')}
                    </Button>
                    {loading && hasLoaded && (
                      <Loader2
                        aria-label={t('loading')}
                        className="ml-1 h-4 w-4 animate-spin text-primary"
                      />
                    )}
                  </div>

                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <Label
                      className="sr-only"
                      htmlFor="calendar-platform-filter"
                    >
                      {t('filters.platformLabel')}
                    </Label>
                    <NativeSelect
                      id="calendar-platform-filter"
                      value={platformFilter}
                      onChange={(event) =>
                        setPlatformFilter(event.target.value as PlatformFilter)
                      }
                      className="min-h-10 border border-border bg-card px-3 text-xs font-semibold text-foreground transition-colors hover:border-input focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
                    >
                      <option value="all">{t('filters.allPlatforms')}</option>
                      <option value="tiktok">{t('platforms.tiktok')}</option>
                      <option value="instagram">
                        {t('platforms.instagram')}
                      </option>
                      <option value="youtube">{t('platforms.youtube')}</option>
                      <option value="linkedin">
                        {t('platforms.linkedin')}
                      </option>
                    </NativeSelect>
                    <Label className="sr-only" htmlFor="calendar-status-filter">
                      {t('filters.statusLabel')}
                    </Label>
                    <NativeSelect
                      id="calendar-status-filter"
                      value={statusFilter}
                      onChange={(event) =>
                        setStatusFilter(event.target.value as StatusFilter)
                      }
                      className="min-h-10 border border-border bg-card px-3 text-xs font-semibold text-foreground transition-colors hover:border-input focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
                    >
                      <option value="all">{t('filters.allStatuses')}</option>
                      <option value="draft">{t('statuses.draft')}</option>
                      <option value="scheduled">
                        {t('statuses.scheduled')}
                      </option>
                      <option value="published">
                        {t('statuses.published')}
                      </option>
                    </NativeSelect>
                    {filtersActive && (
                      <button
                        type="button"
                        onClick={clearFilters}
                        aria-label={t('actions.clearFilters')}
                        title={t('actions.clearFilters')}
                        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      >
                        <FilterX className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[10px] font-medium text-muted-foreground">
                  <span>{t('timezone', { zone: timeZone })}</span>
                  {filtersActive && (
                    <span className="rounded-full bg-primary/[0.07] px-2 py-1 text-primary">
                      {t('filters.resultCount', { count: visiblePosts.length })}
                    </span>
                  )}
                </div>
              </div>

              <div className={styles.gridWrap}>
                <CalendarGrid
                  month={viewDate}
                  range={range}
                  posts={visiblePosts}
                  selectedDate={selectedDate}
                  locale={locale}
                  weekStartsOn={weekStartsOn}
                  onSelectDate={selectDate}
                  onEditPost={(post) => setDialog({ mode: 'edit', post })}
                />
              </div>
            </Card>

            {!hasLoaded && loadError ? null : (
              <Agenda
                date={selectedDate}
                posts={selectedPosts}
                rawPostCount={rawSelectedCount}
                locale={locale}
                filtersActive={filtersActive}
                onCreate={() => setDialog({ mode: 'create' })}
                onEdit={(post) => setDialog({ mode: 'edit', post })}
                onReschedule={(post) => setDialog({ mode: 'reschedule', post })}
                onClearFilters={clearFilters}
              />
            )}
          </div>
        </div>
      )}

      {dialog && (
        <PostDialog
          key={`${dialog.mode}-${
            dialog.mode === 'create' ? selectedKey : dialog.post.id
          }`}
          mode={dialog.mode}
          selectedDate={selectedDate}
          post={dialog.mode === 'create' ? undefined : dialog.post}
          clips={clips}
          timeZone={timeZone}
          onClose={() => setDialog(null)}
          onSave={saveDialogPost}
          onDelete={dialog.mode === 'edit' ? deleteDialogPost : undefined}
        />
      )}
    </div>
  )
}
