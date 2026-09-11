'use client'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'
import { useToast } from '@/components/ui/toast'
import { apiFetch } from '@/lib/auth'
import type {
  CalendarClipOption,
  ScheduledPostRecord
} from '@/lib/content-calendar'
import { AlertCircle, Plus, RefreshCw } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useEffect, useMemo, useRef, useState } from 'react'
import { CalendarAgenda } from './calendar-agenda'
import { CalendarListView } from './calendar-list-view'
import { CalendarMetrics } from './calendar-metrics'
import { CalendarMonthView } from './calendar-month-view'
import { CalendarTimelineView } from './calendar-timeline-view'
import {
  CalendarToolbar,
  type PlatformFilter,
  type StatusFilter
} from './calendar-toolbar'
import {
  type CalendarDensity,
  CalendarRequestError,
  type CalendarViewMode,
  type PostFormPayload,
  addLocalDays,
  addLocalMonths,
  getCalendarRange,
  getWeekRange,
  groupPostsByLocalDay,
  isInRange,
  localDateKey,
  movePostToLocalDate,
  safeTimeZone,
  startOfLocalDay,
  startOfLocalMonth
} from './calendar-utils'
import styles from './calendar-workspace.module.css'
import { PostDialog } from './post-dialog'

type CalendarResponse = {
  posts: ScheduledPostRecord[]
  clips: CalendarClipOption[]
  meta?: { truncated: boolean; limit: number }
}
type PostResponse = { post: ScheduledPostRecord }
type LoadErrorKey = 'auth' | 'rateLimit' | 'load'
type DialogState =
  | { mode: 'create'; initialTime?: string }
  | { mode: 'edit' | 'reschedule'; post: ScheduledPostRecord }
  | null

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

function CalendarSkeleton() {
  const t = useTranslations('contentCalendar')
  return (
    <div aria-label={t('loading')} aria-busy="true" className="mt-7 space-y-4">
      <div className={styles.metrics}>
        {Array.from({ length: 4 }, (_, index) => (
          <Card key={index} className="block gap-0 p-4">
            <div className="flex items-center gap-3">
              <div className="skeleton h-9 w-9 rounded-lg" />
              <div className="flex-1 space-y-2">
                <div className="skeleton h-2.5 w-2/3" />
                <div className="skeleton h-5 w-10" />
              </div>
            </div>
          </Card>
        ))}
      </div>
      <Card className="block min-h-[32rem] gap-0 overflow-hidden p-5">
        <div className="skeleton h-10 w-full" />
        <div className="skeleton mt-5 h-[27rem] w-full" />
      </Card>
    </div>
  )
}

function periodTitle(
  view: CalendarViewMode,
  month: Date,
  selected: Date,
  locale: string,
  weekStartsOn: 0 | 1
) {
  if (view === 'day') {
    return new Intl.DateTimeFormat(locale, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    }).format(selected)
  }
  if (view === 'week') {
    const week = getWeekRange(selected, weekStartsOn)
    const formatter = new Intl.DateTimeFormat(locale, {
      month: 'short',
      day: 'numeric'
    })
    return `${formatter.format(week.start)} – ${formatter.format(
      addLocalDays(week.end, -1)
    )}`
  }
  return new Intl.DateTimeFormat(locale, {
    month: 'long',
    year: 'numeric'
  }).format(month)
}

export function ContentCalendar() {
  const t = useTranslations('contentCalendar')
  const locale = useLocale()
  const toast = useToast()
  const [ready, setReady] = useState(false)
  const [viewDate, setViewDate] = useState(() => new Date(0))
  const [selectedDate, setSelectedDate] = useState(() => new Date(0))
  const [timeZone, setTimeZone] = useState('UTC')
  const [view, setView] = useState<CalendarViewMode>('month')
  const [density, setDensity] = useState<CalendarDensity>('comfortable')
  const [query, setQuery] = useState('')
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
        const params = new URLSearchParams({ start: rangeStart, end: rangeEnd })
        const data = await requestJson<CalendarResponse>(
          `/api/calendar?${params}`,
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

    void loadCalendar()
    return () => controller.abort()
  }, [rangeEnd, rangeStart, ready, refreshToken])

  const visiblePosts = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase(locale)
    return posts.filter((post) => {
      const matchesQuery =
        normalizedQuery === '' ||
        [post.title, post.caption, post.notes, post.clip?.title]
          .filter(Boolean)
          .some((value) =>
            value?.toLocaleLowerCase(locale).includes(normalizedQuery)
          )
      return (
        matchesQuery &&
        (platformFilter === 'all' || post.platforms.includes(platformFilter)) &&
        (statusFilter === 'all' || post.status === statusFilter)
      )
    })
  }, [locale, platformFilter, posts, query, statusFilter])
  const visibleGrouped = useMemo(
    () => groupPostsByLocalDay(visiblePosts),
    [visiblePosts]
  )
  const rawGrouped = useMemo(() => groupPostsByLocalDay(posts), [posts])
  const selectedKey = localDateKey(selectedDate)
  const selectedPosts = visibleGrouped.get(selectedKey) ?? []
  const rawSelectedCount = rawGrouped.get(selectedKey)?.length ?? 0
  const filtersActive =
    query.trim() !== '' || platformFilter !== 'all' || statusFilter !== 'all'
  const weekRange = useMemo(
    () => getWeekRange(selectedDate, weekStartsOn),
    [selectedDate, weekStartsOn]
  )
  const title = useMemo(
    () => periodTitle(view, viewDate, selectedDate, locale, weekStartsOn),
    [locale, selectedDate, view, viewDate, weekStartsOn]
  )

  function clearFilters() {
    setQuery('')
    setPlatformFilter('all')
    setStatusFilter('all')
  }

  function focusDate(date: Date) {
    const nextDate = startOfLocalDay(date)
    setSelectedDate(nextDate)
    if (
      nextDate.getMonth() !== viewDate.getMonth() ||
      nextDate.getFullYear() !== viewDate.getFullYear()
    ) {
      setPosts([])
      setHasLoaded(false)
      setViewDate(startOfLocalMonth(nextDate))
    }
  }

  function navigatePeriod(amount: number) {
    if (view === 'month' || view === 'list') {
      focusDate(addLocalMonths(viewDate, amount))
    } else {
      focusDate(addLocalDays(selectedDate, amount * (view === 'week' ? 7 : 1)))
    }
  }

  function openCreate(date = selectedDate, hour?: number) {
    focusDate(date)
    setDialog({
      mode: 'create',
      initialTime:
        hour === undefined ? undefined : `${String(hour).padStart(2, '0')}:00`
    })
  }

  function mergePost(post: ScheduledPostRecord) {
    setPosts((current) => {
      const withoutPost = current.filter((item) => item.id !== post.id)
      return isInRange(post.scheduledAt, range)
        ? [...withoutPost, post]
        : withoutPost
    })
  }

  async function movePost(
    postId: string,
    targetDate: Date,
    targetHour?: number
  ) {
    const original = posts.find((post) => post.id === postId)
    if (!original || original.status === 'published') return
    const scheduledAt = movePostToLocalDate(
      original.scheduledAt,
      targetDate,
      targetHour
    ).toISOString()
    mutationRevisionRef.current += 1
    setPosts((current) =>
      current.map((post) =>
        post.id === postId ? { ...post, scheduledAt } : post
      )
    )
    setSelectedDate(startOfLocalDay(targetDate))
    try {
      const data = await requestJson<PostResponse>(`/api/calendar/${postId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduledAt })
      })
      mergePost(data.post)
      toast.add('success', t('toasts.moved'))
    } catch {
      setPosts((current) =>
        current.map((post) => (post.id === postId ? original : post))
      )
      toast.add('error', t('errors.move'))
    }
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
        t(
          dialog.mode === 'reschedule' ? 'toasts.rescheduled' : 'toasts.updated'
        )
      )
    }
    mutationRevisionRef.current += 1
    mergePost(post)
    setRefreshToken((current) => current + 1)
    focusDate(new Date(post.scheduledAt))
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

  const listDays = range.days.filter(
    (day) =>
      day.getMonth() === viewDate.getMonth() &&
      day.getFullYear() === viewDate.getFullYear()
  )

  return (
    <div className={`${styles.workspace} dashboard-workspace`}>
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          <Button type="button" disabled={!ready} onClick={() => openCreate()}>
            <Plus className="h-4 w-4" />
            {t('actions.newPost')}
          </Button>
        }
      />

      {!ready || (loading && !hasLoaded) ? (
        <CalendarSkeleton />
      ) : (
        <div className="mt-7 space-y-4">
          <CalendarMetrics posts={posts} month={viewDate} />
          {loadError && (
            <div
              role="alert"
              className="flex flex-wrap items-center gap-3 rounded-lg border border-destructive/25 bg-destructive/[0.055] px-4 py-3 text-destructive"
            >
              <AlertCircle className="h-4 w-4 shrink-0" />
              <p className="min-w-0 flex-1 text-xs font-medium">
                {t(`errors.${loadError}`)}
              </p>
              <button
                type="button"
                onClick={() => setRefreshToken((current) => current + 1)}
                className="inline-flex h-9 items-center gap-2 rounded-md border border-destructive/25 bg-card px-3 text-xs font-semibold text-foreground hover:bg-muted"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                {t('actions.retry')}
              </button>
            </div>
          )}
          {truncatedLimit && (
            <div
              role="status"
              className="rounded-lg border border-warning/25 bg-warning/[0.07] px-4 py-3 text-xs font-medium text-warning"
            >
              {t('truncated', { count: truncatedLimit })}
            </div>
          )}

          <div className={styles.planningLayout}>
            <Card
              as="section"
              aria-label={t('calendarSectionLabel')}
              aria-busy={loading}
              className={`${styles.planner} block gap-0 overflow-hidden py-0`}
            >
              <CalendarToolbar
                title={title}
                view={view}
                density={density}
                query={query}
                platform={platformFilter}
                status={statusFilter}
                loading={loading && hasLoaded}
                resultCount={visiblePosts.length}
                onPrevious={() => navigatePeriod(-1)}
                onNext={() => navigatePeriod(1)}
                onToday={() => focusDate(new Date())}
                onViewChange={setView}
                onDensityChange={setDensity}
                onQueryChange={setQuery}
                onPlatformChange={setPlatformFilter}
                onStatusChange={setStatusFilter}
                onClearFilters={clearFilters}
              />
              <div className="flex items-center justify-between border-b border-border bg-muted/20 px-4 py-2 text-[10px] font-medium text-muted-foreground sm:px-5">
                <span>{t('timezone', { zone: timeZone })}</span>
                <span className="hidden sm:inline">{t('dragHint')}</span>
              </div>
              <div className={styles.gridWrap}>
                {view === 'month' && (
                  <CalendarMonthView
                    month={viewDate}
                    range={range}
                    posts={visiblePosts}
                    selectedDate={selectedDate}
                    locale={locale}
                    weekStartsOn={weekStartsOn}
                    density={density}
                    onSelectDate={focusDate}
                    onCreateDate={(date) => openCreate(date)}
                    onEditPost={(post) => setDialog({ mode: 'edit', post })}
                    onMovePost={(postId, date) => void movePost(postId, date)}
                  />
                )}
                {view === 'week' && (
                  <CalendarTimelineView
                    days={weekRange.days}
                    posts={visiblePosts}
                    selectedDate={selectedDate}
                    locale={locale}
                    density={density}
                    onSelectDate={focusDate}
                    onCreateAt={openCreate}
                    onEditPost={(post) => setDialog({ mode: 'edit', post })}
                    onMovePost={(postId, date, hour) =>
                      void movePost(postId, date, hour)
                    }
                  />
                )}
                {view === 'day' && (
                  <CalendarTimelineView
                    days={[selectedDate]}
                    posts={visiblePosts}
                    selectedDate={selectedDate}
                    locale={locale}
                    density={density}
                    onSelectDate={focusDate}
                    onCreateAt={openCreate}
                    onEditPost={(post) => setDialog({ mode: 'edit', post })}
                    onMovePost={(postId, date, hour) =>
                      void movePost(postId, date, hour)
                    }
                  />
                )}
                {view === 'list' && (
                  <CalendarListView
                    days={listDays}
                    posts={visiblePosts}
                    locale={locale}
                    onCreateDate={(date) => openCreate(date)}
                    onEditPost={(post) => setDialog({ mode: 'edit', post })}
                  />
                )}
              </div>
            </Card>

            {!hasLoaded && loadError ? null : (
              <CalendarAgenda
                date={selectedDate}
                posts={selectedPosts}
                rawPostCount={rawSelectedCount}
                locale={locale}
                filtersActive={filtersActive}
                onCreate={() => openCreate()}
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
            dialog.mode === 'create'
              ? `${selectedKey}-${dialog.initialTime ?? ''}`
              : dialog.post.id
          }`}
          mode={dialog.mode}
          selectedDate={selectedDate}
          initialTime={
            dialog.mode === 'create' ? dialog.initialTime : undefined
          }
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
