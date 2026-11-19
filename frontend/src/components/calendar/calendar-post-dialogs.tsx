'use client'

import { useToast } from '@/components/ui/toast'
import type { ContentPlatform, ScheduledPostRecord } from '@/lib/content-calendar'
import type { PublishingAccount, PublishingData } from '@/lib/publishing'
import type { CalendarClipOption } from '@/lib/content-calendar'
import { useTranslations } from 'next-intl'
import type { PublishingPeriod } from './calendar-period'
import { type PostResponse, requestJson } from './calendar-request'
import { type PostFormPayload, isInRange, localDateKey, normalizeScheduledPost } from './calendar-utils'
import { PostDialog } from './post-dialog'
import { PublishingStatusDialog } from './publishing-status-dialog'

/** Every dialog except the status sheet opens the post form. */
type PostFormDialog =
  | { mode: 'create'; initialTime?: string; initialClipId?: string }
  | { mode: 'edit' | 'reschedule' | 'delete'; post: ScheduledPostRecord }

export type CalendarDialogState = PostFormDialog | { mode: 'status'; post: ScheduledPostRecord } | null

type PostsChange = (change: (posts: ScheduledPostRecord[]) => ScheduledPostRecord[]) => Promise<void>

type CalendarPostDialogsProps = {
  dialog: CalendarDialogState
  posts: ScheduledPostRecord[]
  clips: CalendarClipOption[]
  period: PublishingPeriod
  selectedDate: Date
  timeZone: string
  publishingData: PublishingData | null
  publishingAccounts: PublishingAccount[]
  onDialogChange: (dialog: CalendarDialogState) => void
  onEdit: (post: ScheduledPostRecord) => void
  onSaved: (post: ScheduledPostRecord) => void
  updatePosts: PostsChange
}

function savedToastKey(dialog: PostFormDialog, payload: PostFormPayload, post: ScheduledPostRecord) {
  if (payload.status === 'publish' || post.status === 'publishing') return 'toasts.publishing'
  if (dialog.mode === 'create') return 'toasts.created'
  return dialog.mode === 'reschedule' ? 'toasts.rescheduled' : 'toasts.updated'
}

function dialogKey(dialog: PostFormDialog, selectedDate: Date) {
  if (dialog.mode !== 'create') return `${dialog.mode}-${dialog.post.id}`
  return `create-${localDateKey(selectedDate)}-${dialog.initialTime ?? ''}-${dialog.initialClipId ?? ''}`
}

/** Status, delete and legacy post dialogs of the publishing queue, with their save/delete requests. */
export function CalendarPostDialogs({
  dialog,
  posts,
  clips,
  period,
  selectedDate,
  timeZone,
  publishingData,
  publishingAccounts,
  onDialogChange,
  onEdit,
  onSaved,
  updatePosts
}: CalendarPostDialogsProps) {
  const t = useTranslations('contentCalendar')
  const toast = useToast()
  if (!dialog) return null

  if (dialog.mode === 'status') {
    return (
      <PublishingStatusDialog
        post={posts.find((post) => post.id === dialog.post.id) ?? dialog.post}
        onClose={() => onDialogChange(null)}
        onDelete={() => onDialogChange({ mode: 'delete', post: dialog.post })}
        onEdit={() => onEdit(dialog.post)}
      />
    )
  }

  const current = dialog
  async function save(payload: PostFormPayload) {
    const request =
      current.mode === 'create'
        ? requestJson<PostResponse>('/api/calendar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          })
        : requestJson<PostResponse>(`/api/calendar/${current.post.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          })
    const { post } = await request
    toast.add('success', t(savedToastKey(current, payload, post)))
    const normalized = normalizeScheduledPost(post)
    void updatePosts((items) => {
      const others = items.filter((item) => item.id !== normalized.id)
      return isInRange(normalized.scheduledAt, period) ? [...others, normalized] : others
    })
    onSaved(post)
  }

  async function remove(platforms: ContentPlatform[]) {
    if (current.mode === 'create') return
    const deletedId = current.post.id
    await requestJson<{ deleted: boolean; deletedPlatforms: string[] }>(`/api/calendar/${deletedId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platforms })
    })
    void updatePosts((items) => items.filter((post) => post.id !== deletedId))
    toast.add('success', t('toasts.deleted'))
  }

  const creating = current.mode === 'create'
  return (
    <PostDialog
      key={dialogKey(current, selectedDate)}
      mode={current.mode}
      selectedDate={selectedDate}
      initialTime={creating ? current.initialTime : undefined}
      initialClipId={creating ? current.initialClipId : undefined}
      post={creating ? undefined : current.post}
      clips={clips}
      youtubeAuditApproved={
        publishingData?.providers.find((provider) => provider.id === 'youtube')?.youtubeAuditApproved === true
      }
      publishingClips={publishingData?.clips ?? []}
      publishingAccounts={publishingAccounts}
      platformConnectionsLoaded={publishingData !== null}
      timeZone={timeZone}
      onClose={() => onDialogChange(null)}
      onSave={save}
      onDelete={current.mode === 'edit' || current.mode === 'delete' ? remove : undefined}
    />
  )
}
