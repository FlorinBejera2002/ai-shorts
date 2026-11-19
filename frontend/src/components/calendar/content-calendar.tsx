'use client'

import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useApiResource } from '@/hooks/use-api-resource'
import { useSocialConnection } from '@/hooks/use-social-connection'
import { useRouter } from '@/i18n/navigation'
import type {
  ScheduledPostRecord
} from '@/lib/content-calendar'
import {
  type PublishingData,
  isPublishingAccountUsable
} from '@/lib/publishing'
import { AlertCircle, Plus, RefreshCw } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import { CalendarAccountAvatars } from './calendar-account-avatars'
import { CalendarConnections } from './calendar-connections'
import { CalendarMobileHeader } from './calendar-mobile-header'
import { CalendarPeriodMenu } from './calendar-period-menu'
import {
  type PublishingPeriod,
  monthPeriod,
  periodContains,
  presetPeriod
} from './calendar-period'
import { CalendarPreviewList } from './calendar-preview-list'
import {
  localDateKey,
  safeTimeZone,
  startOfLocalDay,
} from './calendar-utils'
import publishingStyles from './calendar-publishing.module.css'
import { ConnectionSuccessOverlay } from './connection-success-overlay'
import theme from './publishing-theme.module.css'
import { type CalendarLoadError, useCalendarFeed } from './use-calendar-feed'
import { type CalendarDialogState, CalendarPostDialogs } from './calendar-post-dialogs'
import {
  readPublishingView,
  rememberPublishingScroll,
  savePublishingView
} from './calendar-publishing-state'


function CalendarSkeleton() {
  const t = useTranslations('contentCalendar')
  return (
    <div aria-label={t('loading')} aria-busy="true" className="space-y-4">
      <Card
        className={`${publishingStyles.skeletonCard} block min-h-[32rem] gap-0 overflow-hidden p-5`}
      >
        <div className="skeleton h-10 w-full" />
        <div className="skeleton mt-5 h-[27rem] w-full" />
      </Card>
    </div>
  )
}

export function ContentCalendar() {
  const t = useTranslations('contentCalendar')
  const locale = useLocale()
  const searchParams = useSearchParams()
  const router = useRouter()
  const requestedClipId = searchParams.get('clip')
  const weekStartsOn: 0 | 1 = locale.toLowerCase().startsWith('ro') ? 1 : 0
  const [period, setPeriod] = useState<PublishingPeriod>(() => {
    const saved = readPublishingView().period
    return saved
      ? { kind: saved.kind, start: new Date(saved.start), end: new Date(saved.end) }
      : presetPeriod('month', new Date(), weekStartsOn)
  })
  const [periodMenuOpen, setPeriodMenuOpen] = useState(false)
  const [selectedDate, setSelectedDate] = useState(() => {
    const saved = readPublishingView().selectedDate
    return startOfLocalDay(saved ? new Date(saved) : new Date())
  })
  const [timeZone] = useState(safeTimeZone)
  const [dialog, setDialog] = useState<CalendarDialogState>(null)
  const openedRequestedClipRef = useRef(false)
  const restoredScrollRef = useRef(false)
  const feed = useCalendarFeed(period)
  const { posts, clips, hasLoaded, loading, loadError, truncatedLimit } = feed
  const {
    data: publishingData,
    error: publishingError,
    reload: reloadPublishing
  } = useApiResource<PublishingData>('/api/publishing')
  const { connect, busyProvider, connectedProvider, finishConfirmation } =
    useSocialConnection(reloadPublishing)


  useEffect(() => {
    if (!hasLoaded || restoredScrollRef.current) return
    const frame = requestAnimationFrame(() => {
      window.scrollTo({
        top: readPublishingView().scrollY ?? 0,
        behavior: 'instant'
      })
      restoredScrollRef.current = true
    })
    return () => cancelAnimationFrame(frame)
  }, [hasLoaded])

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

  function choosePeriod(next: PublishingPeriod) {
    setPeriod(next)
    savePublishingView({
      period: {
        kind: next.kind,
        start: next.start.toISOString(),
        end: next.end.toISOString()
      }
    })
  }

  function focusDate(date: Date) {
    const nextDate = startOfLocalDay(date)
    setSelectedDate(nextDate)
    savePublishingView({ selectedDate: nextDate.toISOString() })
    if (!periodContains(period, nextDate)) {
      choosePeriod(monthPeriod(nextDate))
    }
  }

  function openCreate(date = selectedDate, hour?: number) {
    rememberPublishingScroll()
    focusDate(date)
    const params = new URLSearchParams({ date: localDateKey(date) })
    if (hour !== undefined)
      params.set('time', `${String(hour).padStart(2, '0')}:00`)
    router.push(`/dashboard/publish/new?${params}`)
  }

  function openEdit(post: ScheduledPostRecord, publishNow = false) {
    if (post.status === 'publishing' || post.status === 'published') {
      setDialog({ mode: 'status', post })
      return
    }
    rememberPublishingScroll()
    // Close any open status or delete dialog so returning to the queue does not reopen it.
    setDialog(null)
    const params = new URLSearchParams({
      date: localDateKey(new Date(post.scheduledAt))
    })
    if (publishNow) params.set('mode', 'publish')
    router.push(`/dashboard/publish/${post.id}/edit?${params}`)
  }


  return (
    <div
      className={`${theme.surface} dashboard-workspace ${publishingStyles.workspace}`}
      data-publishing-workspace=""
      data-publish-surface=""
    >
      {connectedProvider && (
        <ConnectionSuccessOverlay
          key={connectedProvider}
          provider={connectedProvider}
          onComplete={finishConfirmation}
        />
      )}
      <CalendarMobileHeader />
      <header className={publishingStyles.header}>
        <h1 className={publishingStyles.headerTitle}>{t('title')}</h1>
        <CalendarAccountAvatars
          data={publishingData}
          error={publishingError}
          onReload={reloadPublishing}
          onConnect={connect}
          busyProvider={busyProvider}
        />
        <Button
          onClick={() => openCreate()}
          className={publishingStyles.newPost}
          aria-label={t('actions.newPost')}
        >
          <Plus />
          <span>{t('actions.newPost')}</span>
        </Button>
      </header>

      {!hasLoaded && !loadError ? (
        <CalendarSkeleton />
      ) : (
        <div>
          <CalendarFeedNotices loadError={loadError} truncatedLimit={truncatedLimit} onRetry={feed.retry} />

          {hasLoaded && (
            <div>
              {publishingData &&
                publishingAccounts.length === 0 &&
                posts.length === 0 && (
                  <div className={publishingStyles.noAccounts}>
                    <h2>{t('connections.noAccounts')}</h2>
                    <div className="w-full max-w-sm">
                      <CalendarConnections
                        data={publishingData}
                        error={publishingError}
                        onReload={reloadPublishing}
                        onConnect={connect}
                        busyProvider={busyProvider}
                      />
                    </div>
                  </div>
                )}
              {(!publishingData ||
                publishingAccounts.length > 0 ||
                posts.length > 0) && (
                <Card
                  as="section"
                  aria-label={t('calendarSectionLabel')}
                  aria-busy={loading}
                  className={publishingStyles.planner}
                >
                  <CalendarPreviewList
                    posts={posts}
                    publishingClips={publishingData?.clips ?? []}
                    period={period}
                    locale={locale}
                    periodControl={
                      <CalendarPeriodMenu
                        period={period}
                        locale={locale}
                        weekStartsOn={weekStartsOn}
                        open={periodMenuOpen}
                        onOpenChange={setPeriodMenuOpen}
                        onSelect={choosePeriod}
                      />
                    }
                    onCreatePost={() => openCreate()}
                    onChooseAnotherPeriod={() => setPeriodMenuOpen(true)}
                    onOpenPost={(post) => openEdit(post)}
                    onPublishPost={(post) => openEdit(post, true)}
                    onDeletePost={(post) => setDialog({ mode: 'delete', post })}
                    onViewStatus={(post) => setDialog({ mode: 'status', post })}
                  />
                </Card>
              )}
            </div>
          )}
        </div>
      )}

      <CalendarPostDialogs
        dialog={dialog}
        posts={posts}
        clips={clips}
        period={period}
        selectedDate={selectedDate}
        timeZone={timeZone}
        publishingData={publishingData}
        publishingAccounts={publishingAccounts}
        onDialogChange={setDialog}
        onEdit={openEdit}
        onSaved={(post) => focusDate(new Date(post.scheduledAt))}
        updatePosts={feed.updatePosts}
      />
    </div>
  )
}

function CalendarFeedNotices({
  loadError,
  truncatedLimit,
  onRetry
}: {
  loadError: CalendarLoadError | null
  truncatedLimit: number | null
  onRetry: () => void
}) {
  const t = useTranslations('contentCalendar')
  return (
    <>
      {loadError && (
        <div role="alert" className={publishingStyles.loadError}>
          <AlertCircle className="h-4 w-4 shrink-0" />
          <h2 className="min-w-0 text-sm font-medium">{t(`errors.${loadError}`)}</h2>
          <button
            type="button"
            onClick={onRetry}
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
    </>
  )
}
