'use client'

import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'
import { useToast } from '@/components/ui/toast'
import { useApiResource } from '@/hooks/use-api-resource'
import { useSocialConnection } from '@/hooks/use-social-connection'
import { useRouter } from '@/i18n/navigation'
import type {
  CalendarClipOption,
  ContentPlatform,
  ScheduledPostRecord
} from '@/lib/content-calendar'
import {
  type PublishingData,
  isPublishingAccountUsable
} from '@/lib/publishing'
import { AlertCircle, RefreshCw } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import { CalendarConnections } from './calendar-connections'
import { CalendarMetrics } from './calendar-metrics'
import { CalendarPreviewList } from './calendar-preview-list'
import {
  type CalendarResponse,
  type PostResponse,
  requestJson
} from './calendar-request'
import { CalendarToolbar } from './calendar-toolbar'
import {
  CalendarRequestError,
  type CalendarViewMode,
  type PostFormPayload,
  addLocalDays,
  addLocalMonths,
  getCalendarRange,
  getWeekRange,
  isInRange,
  localDateKey,
  normalizeScheduledPost,
  safeTimeZone,
  startOfLocalDay,
  startOfLocalMonth
} from './calendar-utils'
import styles from './calendar-workspace.module.css'
import { ConnectionSuccessOverlay } from './connection-success-overlay'
import { PostDialog } from './post-dialog'
import { PublishingStatusDialog } from './publishing-status-dialog'

type LoadErrorKey = 'auth' | 'rateLimit' | 'load'
type DialogState =
  | { mode: 'create'; initialTime?: string; initialClipId?: string }
  | {
      mode: 'edit' | 'reschedule' | 'status' | 'delete'
      post: ScheduledPostRecord
    }
  | null

function CalendarSkeleton() {
  const t = useTranslations('contentCalendar')
  return (
    <div aria-label={t('loading')} aria-busy="true" className="space-y-4">
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
  const searchParams = useSearchParams()
  const router = useRouter()
  const requestedClipId = searchParams.get('clip')
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
  const [dialog, setDialog] = useState<DialogState>(null)
  const mutationRevisionRef = useRef(0)
  const openedRequestedClipRef = useRef(false)
  const {
    data: publishingData,
    error: publishingError,
    reload: reloadPublishing
  } = useApiResource<PublishingData>('/api/publishing')
  const { connect, busyProvider, connectedProvider, finishConfirmation } =
    useSocialConnection(reloadPublishing)

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
        const params = new URLSearchParams({
          start: rangeStart,
          end: rangeEnd
        })
        const data = await requestJson<CalendarResponse>(
          `/api/calendar?${params}`,
          { signal: controller.signal, cache: 'no-store' }
        )
        if (!Array.isArray(data.posts) || !Array.isArray(data.clips)) {
          throw new CalendarRequestError('Invalid calendar response', 500)
        }
        setClips(data.clips)
        if (mutationRevisionAtStart === mutationRevisionRef.current) {
          setPosts(data.posts.map(normalizeScheduledPost))
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

  useEffect(() => {
    if (
      openedRequestedClipRef.current ||
      !hasLoaded ||
      !requestedClipId ||
      !clips.some((clip) => clip.id === requestedClipId)
    ) {
      return
    }
    openedRequestedClipRef.current = true
    router.replace(
      `/dashboard/publish/new?clip=${encodeURIComponent(requestedClipId)}`
    )
  }, [clips, hasLoaded, requestedClipId, router])

  useEffect(() => {
    const now = Date.now()
    const publishing = posts.some((post) => post.status === 'publishing')
    const nextScheduledAt = posts
      .filter((post) => post.status === 'scheduled')
      .map((post) => new Date(post.scheduledAt).getTime())
      .filter((scheduledAt) => Number.isFinite(scheduledAt))
      .sort((left, right) => left - right)[0]

    if (!publishing && nextScheduledAt === undefined) return
    const delay =
      publishing || nextScheduledAt === undefined
        ? 5_000
        : Math.max(
            1_000,
            Math.min(2_147_000_000, nextScheduledAt - now + 1_000)
          )
    const timer = window.setTimeout(
      () => setRefreshToken((current) => current + 1),
      delay
    )
    return () => window.clearTimeout(timer)
  }, [posts])

  const publishingAccounts = useMemo(
    () =>
      (publishingData?.accounts ?? []).filter(
        (account) =>
          isPublishingAccountUsable(account) &&
          publishingData?.providers.some(
            (provider) =>
              provider.id === account.provider && provider.supportsPublishing
          )
      ),
    [publishingData]
  )
  const selectedKey = localDateKey(selectedDate)
  const title = useMemo(
    () => periodTitle('month', viewDate, selectedDate, locale, weekStartsOn),
    [locale, selectedDate, viewDate, weekStartsOn]
  )

  function focusDate(date: Date) {
    const nextDate = startOfLocalDay(date)
    setSelectedDate(nextDate)
    if (
      nextDate.getMonth() !== viewDate.getMonth() ||
      nextDate.getFullYear() !== viewDate.getFullYear()
    ) {
      setViewDate(startOfLocalMonth(nextDate))
    }
  }

  function navigatePeriod(amount: number) {
    focusDate(addLocalMonths(viewDate, amount))
  }

  function openCreate(date = selectedDate, hour?: number) {
    focusDate(date)
    const params = new URLSearchParams({ date: localDateKey(date) })
    if (hour !== undefined)
      params.set('time', `${String(hour).padStart(2, '0')}:00`)
    router.push(`/dashboard/publish/new?${params}`)
  }

  function openEdit(post: ScheduledPostRecord) {
    if (post.status === 'publishing' || post.status === 'published') {
      setDialog({ mode: 'status', post })
      return
    }
    router.push(
      `/dashboard/publish/${post.id}/edit?date=${localDateKey(new Date(post.scheduledAt))}`
    )
  }

  function mergePost(post: ScheduledPostRecord) {
    const normalizedPost = normalizeScheduledPost(post)
    setPosts((current) => {
      const withoutPost = current.filter(
        (item) => item.id !== normalizedPost.id
      )
      return isInRange(normalizedPost.scheduledAt, range)
        ? [...withoutPost, normalizedPost]
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
      toast.add(
        'success',
        t(
          payload.status === 'publish' || post.status === 'publishing'
            ? 'toasts.publishing'
            : 'toasts.created'
        )
      )
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
          payload.status === 'publish' || post.status === 'publishing'
            ? 'toasts.publishing'
            : dialog.mode === 'reschedule'
              ? 'toasts.rescheduled'
              : 'toasts.updated'
        )
      )
    }
    mutationRevisionRef.current += 1
    mergePost(post)
    setRefreshToken((current) => current + 1)
    focusDate(new Date(post.scheduledAt))
  }

  async function deleteDialogPost(platforms: ContentPlatform[]) {
    if (!dialog || dialog.mode === 'create') return
    await requestJson<{ deleted: boolean; deletedPlatforms: string[] }>(
      `/api/calendar/${dialog.post.id}`,
      {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platforms })
      }
    )
    mutationRevisionRef.current += 1
    setPosts((current) => current.filter((post) => post.id !== dialog.post.id))
    setRefreshToken((current) => current + 1)
    toast.add('success', t('toasts.deleted'))
  }

  return (
    <div className={`${styles.workspace} dashboard-workspace`}>
      {connectedProvider && (
        <ConnectionSuccessOverlay
          key={connectedProvider}
          provider={connectedProvider}
          onComplete={finishConfirmation}
        />
      )}
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          <CalendarMetrics posts={posts} month={viewDate} variant="header" />
        }
      />

      {!ready || (loading && !hasLoaded) ? (
        <CalendarSkeleton />
      ) : (
        <div className="space-y-5">
          {loadError && (
            <div
              role="alert"
              className="flex flex-wrap items-center gap-3 rounded-md border border-destructive/25 bg-destructive/[0.055] px-4 py-3 text-destructive"
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
              className="rounded-md border border-warning/25 bg-warning/[0.07] px-4 py-3 text-xs font-medium text-warning"
            >
              {t('truncated', { count: truncatedLimit })}
            </div>
          )}

          <div className={styles.planningLayout}>
            <CalendarConnections
              data={publishingData}
              error={publishingError}
              onReload={reloadPublishing}
              onConnect={connect}
              busyProvider={busyProvider}
            />
            <Card
              as="section"
              aria-label={t('calendarSectionLabel')}
              aria-busy={loading}
              className={`${styles.planner} block gap-0 overflow-hidden py-0`}
            >
              <CalendarToolbar
                title={title}
                loading={loading && hasLoaded}
                onPrevious={() => navigatePeriod(-1)}
                onNext={() => navigatePeriod(1)}
                onToday={() => focusDate(new Date())}
                onNewPost={() => openCreate()}
              />
              <div className={styles.gridWrap}>
                <CalendarPreviewList
                  posts={posts}
                  accounts={publishingAccounts}
                  locale={locale}
                  onCreatePost={() => openCreate()}
                  onOpenPost={openEdit}
                />
              </div>
            </Card>
          </div>
        </div>
      )}

      {dialog?.mode === 'status' && (
        <PublishingStatusDialog
          post={posts.find((post) => post.id === dialog.post.id) ?? dialog.post}
          onClose={() => setDialog(null)}
          onDelete={() => setDialog({ mode: 'delete', post: dialog.post })}
        />
      )}

      {dialog && dialog.mode !== 'status' && (
        <PostDialog
          key={`${dialog.mode}-${
            dialog.mode === 'create'
              ? `${selectedKey}-${dialog.initialTime ?? ''}-${dialog.initialClipId ?? ''}`
              : dialog.post.id
          }`}
          mode={dialog.mode}
          selectedDate={selectedDate}
          initialTime={
            dialog.mode === 'create' ? dialog.initialTime : undefined
          }
          initialClipId={
            dialog.mode === 'create' ? dialog.initialClipId : undefined
          }
          post={dialog.mode === 'create' ? undefined : dialog.post}
          clips={clips}
          publishingClips={publishingData?.clips ?? []}
          publishingAccounts={publishingAccounts}
          platformConnectionsLoaded={publishingData !== null}
          timeZone={timeZone}
          onClose={() => setDialog(null)}
          onSave={saveDialogPost}
          onDelete={
            dialog.mode === 'edit' || dialog.mode === 'delete'
              ? deleteDialogPost
              : undefined
          }
        />
      )}
    </div>
  )
}
