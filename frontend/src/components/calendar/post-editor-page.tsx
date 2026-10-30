'use client'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { LoadingIndicator } from '@/components/ui/loading-indicator'
import { PageHeader } from '@/components/ui/page-header'
import { useToast } from '@/components/ui/toast'
import { useApiResource } from '@/hooks/use-api-resource'
import { useSocialConnection } from '@/hooks/use-social-connection'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { useRouter } from '@/i18n/navigation'
import type { ContentPlatform } from '@/lib/content-calendar'
import {
  type PublishingData,
  isPublishingAccountUsable
} from '@/lib/publishing'
import { useTranslations } from 'next-intl'
import { useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { useQueryClient, type QueryFilters } from '@tanstack/react-query'
import {
  type CalendarResponse,
  type PostResponse,
  requestJson
} from './calendar-request'
import {
  type PostFormPayload,
  addLocalDays,
  normalizeScheduledPost,
  safeTimeZone,
  startOfLocalDay
} from './calendar-utils'
import { PostDialog } from './post-dialog'
import { CalendarConnections } from './calendar-connections'
import { ConnectionSuccessOverlay } from './connection-success-overlay'
import theme from './publishing-theme.module.css'
import composerStyles from './post-composer.module.css'

const calendarQueries: QueryFilters = {
  queryKey: ['api-resource'],
  predicate: (query) =>
    typeof query.queryKey[1] === 'string' &&
    query.queryKey[1].startsWith('/api/calendar?')
}

export function PostEditorPage({ postId }: { postId?: string }) {
  const t = useTranslations('contentCalendar')
  const router = useRouter()
  const search = useSearchParams()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [today] = useState(() => startOfLocalDay(new Date()))
  const requestedDate = search.get('date')
  const parsedDate =
    requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate)
      ? new Date(`${requestedDate}T00:00:00`)
      : today
  const selectedDate = Number.isNaN(parsedDate.getTime()) ? today : parsedDate
  const params = new URLSearchParams({
    start: selectedDate.toISOString(),
    end: addLocalDays(selectedDate, 1).toISOString()
  })
  const calendar = useApiResource<CalendarResponse>(`/api/calendar?${params}`)
  const publishing = useApiResource<PublishingData>('/api/publishing')
  const [connectionsOpen, setConnectionsOpen] = useState(false)
  const { connect, busyProvider, connectedProvider, finishConfirmation } = useSocialConnection(publishing.reload)
  const post = calendar.data?.posts.find((item) => item.id === postId)
  const error = calendar.error ?? publishing.error
  const loaded = calendar.data !== null && publishing.data !== null
  const unavailable = loaded && !!postId && !post
  const locked =
    post && (post.status === 'published' || post.status === 'publishing')
  const close = () => router.push('/dashboard/publish')

  async function save(payload: PostFormPayload) {
    const data = await requestJson<PostResponse>(
      postId ? `/api/calendar/${postId}` : '/api/calendar',
      {
        method: postId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }
    )
    // Reopening initializes the form from cache before a background fetch finishes.
    await queryClient.cancelQueries(calendarQueries)
    queryClient.setQueriesData<CalendarResponse>(calendarQueries, (cached) =>
      cached
        ? {
            ...cached,
            posts: cached.posts.map((item) =>
              item.id === data.post.id ? data.post : item
            )
          }
        : cached
    )
    void queryClient.invalidateQueries(calendarQueries)
    toast.add(
      'success',
      t(
        payload.status === 'publish' || data.post.status === 'publishing'
          ? 'toasts.publishing'
          : postId
            ? 'toasts.updated'
            : 'toasts.created'
      )
    )
  }

  async function deletePost(platforms: ContentPlatform[]) {
    if (!postId) return
    await requestJson<{ deleted: boolean; deletedPlatforms: string[] }>(
      `/api/calendar/${postId}`,
      {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platforms })
      }
    )
    toast.add('success', t('toasts.deleted'))
  }

  if (!loaded || unavailable || locked) {
    return (
      <div className={`${theme.surface} dashboard-workspace space-y-6`} data-publish-surface="">
        <PageHeader
          title={t(postId ? 'dialog.editTitle' : 'dialog.createTitle')}
        />
        <Card className="flex min-h-64 flex-col items-center justify-center gap-4 p-8">
          {error || unavailable || locked ? (
            <>
              <p role="alert" className="text-sm text-muted-foreground">
                {unavailable
                  ? t('errors.notFound')
                  : locked
                    ? t('toasts.locked')
                    : t('errors.load')}
              </p>
              {error && (
                <Button
                  variant="outline"
                  onClick={() => {
                    calendar.reload()
                    publishing.reload()
                  }}
                >
                  {t('actions.retry')}
                </Button>
              )}
              <Button variant="outline" onClick={close}>
                {t('actions.cancel')}
              </Button>
            </>
          ) : (
            <div role="status" aria-label={t('loading')} aria-busy="true">
              <LoadingIndicator className="size-20" />
            </div>
          )}
        </Card>
      </div>
    )
  }

  const publishingData = publishing.data!
  const calendarData = calendar.data!
  const accounts = publishingData.accounts.filter(
    (account) =>
      isPublishingAccountUsable(account) &&
      publishingData.providers.some(
        (provider) =>
          provider.id === account.provider && provider.supportsPublishing
      )
  )
  return (
    <>
    <PostDialog
      key={`${postId ?? 'new'}-${requestedDate ?? ''}-${search.get('clip') ?? ''}`}
      presentation="page"
      mode={postId ? 'edit' : 'create'}
      selectedDate={selectedDate}
      initialTime={search.get('time') ?? undefined}
      initialClipId={search.get('clip') ?? undefined}
      initialStatus={search.get('mode') === 'publish' ? 'publish' : undefined}
      onConnectRequest={() => setConnectionsOpen(true)}
      post={post ? normalizeScheduledPost(post) : undefined}
      clips={calendarData.clips}
      youtubeAuditApproved={publishingData.providers.find(provider => provider.id === 'youtube')?.youtubeAuditApproved === true}
      publishingClips={publishingData.clips}
      publishingAccounts={accounts}
      platformConnectionsLoaded={true}
      timeZone={safeTimeZone()}
      onSave={save}
      onDelete={postId ? deletePost : undefined}
      onClose={close}
    />
    <Dialog open={connectionsOpen} onOpenChange={setConnectionsOpen}>
      <DialogContent className={`${theme.surface} ${composerStyles.connectionsDialog}`} overlayClassName={theme.overlay} data-publish-surface="" aria-describedby={undefined}>
        <DialogTitle>{t('connections.title')}</DialogTitle>
        <CalendarConnections data={publishingData} error={publishing.error} onReload={publishing.reload} onConnect={connect} busyProvider={busyProvider} />
        <Button type="button" variant="outline" onClick={() => setConnectionsOpen(false)}>{t('actions.done')}</Button>
      </DialogContent>
    </Dialog>
    {connectedProvider && <ConnectionSuccessOverlay provider={connectedProvider} onComplete={finishConfirmation} />}
    </>
  )
}
