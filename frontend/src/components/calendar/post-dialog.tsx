'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Link } from '@/i18n/navigation'

import type {
  CalendarClipOption,
  CalendarMutationStatus,
  ContentPlatform,
  ScheduledPostRecord
} from '@/lib/content-calendar'
import type { PublishingAccount } from '@/lib/publishing'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  AlertTriangle,
  CalendarClock,
  Check,
  ExternalLink,
  Film,
  Loader2,
  Save,
  Trash2,
  X
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import {
  type FormEvent,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState
} from 'react'
import { createPortal } from 'react-dom'
import {
  CalendarRequestError,
  EDITABLE_CALENDAR_STATUSES,
  type PostFormPayload,
  combineLocalDateTime,
  getDefaultPlanningTime,
  localDateKey,
  localTimeValue
} from './calendar-utils'
import styles from './calendar-workspace.module.css'
import { PlatformOptionIcon } from './platform-mark'
import { SchedulePicker } from './schedule-picker'

type DialogMode = 'create' | 'edit' | 'reschedule'

type FormState = {
  title: string
  caption: string
  notes: string
  platforms: ContentPlatform[]
  accountIds: string[]
  status: CalendarMutationStatus
  date: string
  time: string
  clipId: string
}

type FormErrors = Partial<Record<keyof FormState | 'form', string>>

const inputClassName =
  'w-full rounded-md border border-border bg-background px-3 text-sm text-foreground shadow-none outline-none transition-colors placeholder:text-muted-foreground/70 hover:border-border hover:bg-background focus:border-border focus:bg-background focus:outline-none focus:ring-0 focus-visible:border-border focus-visible:bg-background focus-visible:ring-0'

function initialFormState(
  selectedDate: Date,
  publishingAccounts: PublishingAccount[],
  post?: ScheduledPostRecord,
  initialTime?: string
): FormState {
  const scheduledAt = post
    ? new Date(post.scheduledAt)
    : getDefaultPlanningTime(selectedDate)
  const availableAccountIds = new Set(
    publishingAccounts.map((account) => account.id)
  )
  const defaultAccount = publishingAccounts[0]
  const accountIds =
    post?.accountIds.filter((accountId) =>
      availableAccountIds.has(accountId)
    ) ?? (defaultAccount ? [defaultAccount.id] : [])
  const selectedAccountIds = new Set(accountIds)
  const selectedProviders = publishingAccounts
    .filter((account) => selectedAccountIds.has(account.id))
    .map((account) => account.provider)

  return {
    title: post?.title ?? '',
    caption: post?.caption ?? '',
    notes: post?.notes ?? '',
    platforms: [...new Set(selectedProviders)],
    accountIds,
    status: post?.status === 'draft' ? 'draft' : 'scheduled',
    date: localDateKey(scheduledAt),
    time: post
      ? localTimeValue(scheduledAt)
      : (initialTime ?? localTimeValue(scheduledAt)),
    clipId: post?.clip?.id ?? ''
  }
}

function captionFromClip(
  clip: CalendarClipOption,
  platforms: ContentPlatform[]
): string {
  for (const platform of platforms) {
    if (platform === 'tiktok' && clip.captionTiktok) {
      return clip.captionTiktok
    }
    if (platform === 'instagram' && clip.captionInstagram) {
      return clip.captionInstagram
    }
    if (platform === 'youtube' && clip.captionYoutube) {
      return clip.captionYoutube
    }
  }
  return (
    clip.captionInstagram ?? clip.captionTiktok ?? clip.captionYoutube ?? ''
  )
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null
  return (
    <p id={id} className="mt-1.5 text-xs font-medium text-destructive">
      {message}
    </p>
  )
}

export function PostDialog({
  mode,
  selectedDate,
  post,
  clips,
  publishingAccounts,
  platformConnectionsLoaded,
  timeZone,
  initialTime,
  onClose,
  onSave,
  onDelete
}: {
  mode: DialogMode
  selectedDate: Date
  post?: ScheduledPostRecord
  clips: CalendarClipOption[]
  publishingAccounts: PublishingAccount[]
  platformConnectionsLoaded: boolean
  timeZone: string
  initialTime?: string
  onClose: () => void
  onSave: (payload: PostFormPayload) => Promise<void>
  onDelete?: () => Promise<void>
}) {
  const t = useTranslations('contentCalendar')
  const reduceMotion = useReducedMotion()
  const titleId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const titleInputRef = useRef<HTMLInputElement>(null)
  const deleteButtonRef = useRef<HTMLButtonElement>(null)
  const confirmDeleteButtonRef = useRef<HTMLButtonElement>(null)
  const wasConfirmingDeleteRef = useRef(false)
  const onCloseRef = useRef(onClose)
  const busyRef = useRef(false)
  const [mounted, setMounted] = useState(false)
  const [form, setForm] = useState<FormState>(() =>
    initialFormState(selectedDate, publishingAccounts, post, initialTime)
  )
  const [errors, setErrors] = useState<FormErrors>({})
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const busy = saving || deleting
  const selectedAccountIds = useMemo(
    () => new Set(form.accountIds),
    [form.accountIds]
  )
  const selectableClips =
    post?.clip && !clips.some((clip) => clip.id === post.clip?.id)
      ? [
          {
            ...post.clip,
            captionTiktok: null,
            captionInstagram: null,
            captionYoutube: null
          },
          ...clips
        ]
      : clips

  onCloseRef.current = onClose
  busyRef.current = busy

  useEffect(() => {
    setMounted(true)
    const previousFocus = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    const appShell =
      document.getElementById('dashboard-shell') ??
      document.getElementById('dashboard-main')
    const appShellWasInert = appShell?.hasAttribute('inert') ?? false
    appShell?.setAttribute('inert', '')
    document.body.style.overflow = 'hidden'

    const focusFrame = requestAnimationFrame(() => {
      titleInputRef.current?.focus()
    })

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        if (
          event.defaultPrevented ||
          document.querySelector(
            '[data-slot="select-content"][data-state="open"]'
          )
        ) {
          return
        }
        event.preventDefault()
        if (!busyRef.current) onCloseRef.current()
        return
      }

      if (event.key !== 'Tab' || !dialogRef.current) return
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      ).filter((element) => !element.hasAttribute('hidden'))
      const first = focusable[0]
      const last = focusable.at(-1)
      if (!first || !last) return

      if (!dialogRef.current.contains(document.activeElement)) {
        event.preventDefault()
        if (event.shiftKey) last.focus()
        else first.focus()
        return
      }

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      cancelAnimationFrame(focusFrame)
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
      if (!appShellWasInert) appShell?.removeAttribute('inert')
      previousFocus?.focus()
    }
  }, [])

  useEffect(() => {
    const wasConfirming = wasConfirmingDeleteRef.current
    wasConfirmingDeleteRef.current = confirmDelete
    if (!confirmDelete && !wasConfirming) return

    const frame = requestAnimationFrame(() => {
      if (confirmDelete) confirmDeleteButtonRef.current?.focus()
      else deleteButtonRef.current?.focus()
    })
    return () => cancelAnimationFrame(frame)
  }, [confirmDelete])

  function setField<Field extends keyof FormState>(
    field: Field,
    value: FormState[Field]
  ) {
    setForm((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({
      ...current,
      [field]: undefined,
      form: undefined
    }))
  }

  function toggleAccount(account: PublishingAccount) {
    setForm((current) => {
      const currentAccountIds = new Set(current.accountIds)
      const removing = currentAccountIds.delete(account.id)
      if (!removing) currentAccountIds.add(account.id)
      const nextAccountIds = [...currentAccountIds]
      const selectedProviders = new Set(
        publishingAccounts
          .filter((candidate) => currentAccountIds.has(candidate.id))
          .map((candidate) => candidate.provider)
      )
      return {
        ...current,
        accountIds: nextAccountIds,
        platforms: [...selectedProviders]
      }
    })
    setErrors((current) => ({
      ...current,
      platforms: undefined,
      accountIds: undefined,
      form: undefined
    }))
  }

  function handleClipChange(clipId: string) {
    const clip = clips.find((item) => item.id === clipId)
    setForm((current) => ({
      ...current,
      clipId,
      title: current.title || clip?.title || '',
      caption:
        current.caption ||
        (clip ? captionFromClip(clip, current.platforms) : '')
    }))
    setErrors((current) => ({
      ...current,
      clipId: undefined,
      form: undefined
    }))
  }

  function validate(): { payload?: PostFormPayload; errors: FormErrors } {
    const nextErrors: FormErrors = {}
    const scheduledAt = combineLocalDateTime(form.date, form.time)

    if (mode !== 'reschedule') {
      if (!form.title.trim()) nextErrors.title = t('validation.titleRequired')
      else if (form.title.trim().length > 120) {
        nextErrors.title = t('validation.titleLength')
      }
      if (form.caption.length > 5000) {
        nextErrors.caption = t('validation.captionLength')
      }
      if (form.notes.length > 2000) {
        nextErrors.notes = t('validation.notesLength')
      }
      if (form.platforms.length === 0) {
        nextErrors.platforms = t('validation.platformRequired')
      }
      if (form.status !== 'draft' && form.accountIds.length === 0) {
        nextErrors.accountIds = t('validation.accountRequired')
      }
      if (form.status !== 'draft' && !form.clipId) {
        nextErrors.clipId = t('validation.clipRequired')
      }
    }

    if (!form.date) nextErrors.date = t('validation.dateRequired')
    if (!form.time) nextErrors.time = t('validation.timeRequired')
    if (form.date && form.time && !scheduledAt) {
      nextErrors.date = t('validation.dateInvalid')
    }

    if (Object.keys(nextErrors).length > 0 || !scheduledAt) {
      return { errors: nextErrors }
    }

    if (mode === 'reschedule') {
      return {
        errors: nextErrors,
        payload: { scheduledAt: scheduledAt.toISOString() }
      }
    }

    return {
      errors: nextErrors,
      payload: {
        title: form.title.trim(),
        caption: form.caption.trim() || null,
        notes: form.notes.trim() || null,
        platforms: form.platforms,
        accountIds: form.accountIds,
        status: form.status,
        scheduledAt:
          form.status === 'scheduled'
            ? scheduledAt.toISOString()
            : new Date().toISOString(),
        clipId: form.clipId || null
      }
    }
  }

  function localizeRequestError(error: unknown): FormErrors {
    if (!(error instanceof CalendarRequestError)) {
      return { form: t('errors.save') }
    }

    const fieldErrors: FormErrors = {}
    for (const issue of error.issues) {
      if (issue.field === 'title') {
        fieldErrors.title = t('validation.titleInvalid')
      } else if (issue.field === 'caption') {
        fieldErrors.caption = t('validation.captionLength')
      } else if (issue.field === 'notes') {
        fieldErrors.notes = t('validation.notesLength')
      } else if (issue.field === 'platforms') {
        fieldErrors.platforms = t('validation.platformRequired')
      } else if (issue.field === 'accountIds') {
        fieldErrors.accountIds = t('validation.accountRequired')
      } else if (issue.field === 'scheduledAt') {
        fieldErrors.date = t('validation.dateInvalid')
      } else if (issue.field === 'clipId') {
        fieldErrors.clipId = t('validation.clipInvalid')
      } else if (issue.field === 'status') {
        fieldErrors.status = t('validation.statusInvalid')
      }
    }

    if (Object.keys(fieldErrors).length > 0) return fieldErrors
    if (error.status === 401) return { form: t('errors.auth') }
    if (error.status === 404) return { form: t('errors.notFound') }
    if (error.status === 429) return { form: t('errors.rateLimit') }
    return { form: t('errors.save') }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    const validation = validate()
    if (!validation.payload) {
      setErrors(validation.errors)
      return
    }

    setSaving(true)
    setErrors({})
    try {
      await onSave(validation.payload)
      onClose()
    } catch (error) {
      setErrors(localizeRequestError(error))
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!onDelete || busy) return
    setDeleting(true)
    setErrors({})
    try {
      await onDelete()
      onClose()
    } catch (error) {
      if (error instanceof CalendarRequestError && error.status === 401) {
        setErrors({ form: t('errors.auth') })
      } else if (
        error instanceof CalendarRequestError &&
        error.status === 404
      ) {
        setErrors({ form: t('errors.notFound') })
      } else if (
        error instanceof CalendarRequestError &&
        error.status === 429
      ) {
        setErrors({ form: t('errors.rateLimit') })
      } else {
        setErrors({ form: t('errors.delete') })
      }
      setConfirmDelete(false)
    } finally {
      setDeleting(false)
    }
  }

  if (!mounted) return null

  const isReschedule = mode === 'reschedule'
  const dialogTitle = confirmDelete
    ? t('dialog.deleteTitle')
    : mode === 'create'
      ? t('dialog.createTitle')
      : isReschedule
        ? t('dialog.rescheduleTitle')
        : t('dialog.editTitle')

  return createPortal(
    <AnimatePresence>
      <div className="fixed inset-0 z-[120] overflow-y-auto">
        <motion.div
          aria-hidden="true"
          className="fixed inset-0 bg-slate-950/55 backdrop-blur-[3px]"
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.18 }}
          onMouseDown={() => {
            if (!busy) onClose()
          }}
        />
        <div className="flex min-h-full items-end justify-center p-0 sm:items-center sm:p-5">
          <motion.div
            ref={dialogRef}
            role={confirmDelete ? 'alertdialog' : 'dialog'}
            aria-modal="true"
            aria-labelledby={titleId}
            aria-busy={busy}
            initial={reduceMotion ? false : { opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            onMouseDown={(event) => event.stopPropagation()}
            className={`${styles.dialog} relative z-10 flex max-h-[min(92dvh,54rem)] w-full max-w-2xl flex-col overflow-hidden rounded-t-md border border-border bg-card text-card-foreground shadow-2xl sm:rounded-md`}
          >
            <div className="relative px-5 pb-4 pt-5 sm:px-6 sm:pt-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-foreground">
                    <CalendarClock className="h-4 w-4" />
                  </span>
                  <h2
                    id={titleId}
                    className="truncate text-xl font-semibold sm:text-2xl"
                  >
                    {dialogTitle}
                  </h2>
                </div>
                <button
                  type="button"
                  aria-label={t('actions.close')}
                  disabled={busy}
                  onClick={onClose}
                  className="-mr-2 -mt-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {confirmDelete ? (
              <div className="overflow-y-auto px-5 py-6 sm:px-6">
                <div className="rounded-md border border-destructive/25 bg-destructive/[0.06] p-4">
                  <div className="flex gap-3">
                    <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-destructive/10 text-destructive">
                      <AlertTriangle className="h-4 w-4" />
                    </span>
                    <div>
                      <h3 className="text-sm font-semibold">
                        {t('dialog.deleteWarningTitle')}
                      </h3>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                        {t('dialog.deleteWarning')}
                      </p>
                    </div>
                  </div>
                </div>
                {errors.form && (
                  <div
                    role="alert"
                    className="mt-4 rounded-md border border-destructive/25 bg-destructive/[0.06] px-3 py-2.5 text-xs font-medium text-destructive"
                  >
                    {errors.form}
                  </div>
                )}
                <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <Button
                    type="button"
                    disabled={busy}
                    onClick={() => setConfirmDelete(false)}
                    variant="outline"
                    className=""
                  >
                    {t('actions.keep')}
                  </Button>
                  <button
                    ref={confirmDeleteButtonRef}
                    type="button"
                    disabled={busy}
                    onClick={handleDelete}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-destructive px-4 text-[13px] font-bold text-destructive-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {deleting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                    {deleting
                      ? t('actions.deleting')
                      : t('actions.confirmDelete')}
                  </button>
                </div>
              </div>
            ) : (
              <form
                noValidate={true}
                onSubmit={handleSubmit}
                className="flex min-h-0 flex-1 flex-col"
              >
                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4 sm:px-6">
                  {errors.form && (
                    <div
                      role="alert"
                      className="rounded-md border border-destructive/25 bg-destructive/[0.06] px-3 py-2.5 text-xs font-medium text-destructive"
                    >
                      {errors.form}
                    </div>
                  )}

                  {!isReschedule && (
                    <>
                      <div>
                        <Label
                          htmlFor={`${titleId}-title`}
                          className="text-xs font-semibold text-foreground"
                        >
                          {t('form.titleLabel')}
                        </Label>
                        <Input
                          ref={titleInputRef}
                          id={`${titleId}-title`}
                          value={form.title}
                          maxLength={120}
                          required={true}
                          aria-invalid={Boolean(errors.title)}
                          aria-describedby={
                            errors.title ? `${titleId}-title-error` : undefined
                          }
                          onChange={(event) =>
                            setField('title', event.target.value)
                          }
                          placeholder={t('form.titlePlaceholder')}
                          className={`mt-1.5 ${inputClassName}`}
                        />
                        <div className="flex items-start justify-between gap-3">
                          <FieldError
                            id={`${titleId}-title-error`}
                            message={errors.title}
                          />
                          <span className="ml-auto mt-1.5 text-[10px] tabular-nums text-muted-foreground">
                            {form.title.length}/120
                          </span>
                        </div>
                      </div>

                      <fieldset
                        aria-describedby={
                          errors.platforms
                            ? `${titleId}-platforms-error`
                            : undefined
                        }
                      >
                        <legend className="text-xs font-semibold text-foreground">
                          {t('form.platformsLabel')}
                        </legend>
                        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                          {publishingAccounts.map((account) => {
                            const selected = selectedAccountIds.has(account.id)
                            return (
                              <button
                                key={account.id}
                                type="button"
                                aria-pressed={selected}
                                onClick={() => toggleAccount(account)}
                                className={`relative flex min-h-11 items-center gap-2 rounded-md border px-3 text-xs font-semibold transition-colors ${
                                  selected
                                    ? 'border-foreground bg-foreground text-background'
                                    : 'border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground'
                                }`}
                              >
                                <PlatformOptionIcon
                                  platform={account.provider}
                                />
                                <span className="min-w-0 truncate">
                                  {account.username
                                    ? `@${account.username}`
                                    : account.name}
                                </span>
                                <span className="ml-auto text-[10px] opacity-70">
                                  {t(`platforms.${account.provider}`)}
                                </span>
                                {selected && <Check className="h-3.5 w-3.5" />}
                              </button>
                            )
                          })}
                        </div>
                        {platformConnectionsLoaded &&
                          publishingAccounts.length === 0 && (
                            <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/45 px-3 py-2 text-[11px] text-muted-foreground">
                              <span>{t('form.noConnectedPlatforms')}</span>
                              <Link
                                href="/dashboard/publish"
                                className="inline-flex items-center gap-1 font-semibold text-foreground underline-offset-4 hover:underline"
                              >
                                {t('form.openPublishing')}
                                <ExternalLink className="size-3" />
                              </Link>
                            </div>
                          )}
                        <FieldError
                          id={`${titleId}-platforms-error`}
                          message={errors.platforms ?? errors.accountIds}
                        />
                      </fieldset>

                      <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                          <Label
                            htmlFor={`${titleId}-clip`}
                            className="text-xs font-semibold text-foreground"
                          >
                            {t('form.clipLabel')}
                          </Label>
                          <div className="mt-1.5">
                            <Select
                              value={form.clipId || 'none'}
                              onValueChange={(value) =>
                                handleClipChange(value === 'none' ? '' : value)
                              }
                            >
                              <SelectTrigger
                                id={`${titleId}-clip`}
                                aria-invalid={Boolean(errors.clipId)}
                                aria-describedby={
                                  errors.clipId
                                    ? `${titleId}-clip-error`
                                    : undefined
                                }
                                className="h-10 w-full bg-background px-3 text-sm shadow-none"
                              >
                                <Film className="h-4 w-4 text-muted-foreground" />
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent
                                position="popper"
                                align="start"
                                className="z-[130]"
                              >
                                <SelectItem value="none">
                                  {t('form.noClip')}
                                </SelectItem>
                                {selectableClips.map((clip) => (
                                  <SelectItem key={clip.id} value={clip.id}>
                                    {clip.title} · {clip.viralScore}/10
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <FieldError
                            id={`${titleId}-clip-error`}
                            message={errors.clipId}
                          />
                        </div>
                        <div>
                          <Label
                            htmlFor={`${titleId}-status`}
                            className="text-xs font-semibold text-foreground"
                          >
                            {t('form.statusLabel')}
                          </Label>
                          <div className="mt-1.5">
                            <Select
                              value={form.status}
                              onValueChange={(value) =>
                                setField(
                                  'status',
                                  value as CalendarMutationStatus
                                )
                              }
                            >
                              <SelectTrigger
                                id={`${titleId}-status`}
                                aria-invalid={Boolean(errors.status)}
                                aria-describedby={
                                  errors.status
                                    ? `${titleId}-status-error`
                                    : undefined
                                }
                                className="h-10 w-full bg-background px-3 text-sm shadow-none"
                              >
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent
                                position="popper"
                                align="start"
                                className="z-[130]"
                              >
                                {EDITABLE_CALENDAR_STATUSES.map((status) => (
                                  <SelectItem key={status} value={status}>
                                    {t(`statuses.${status}`)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <FieldError
                            id={`${titleId}-status-error`}
                            message={errors.status}
                          />
                        </div>
                      </div>
                    </>
                  )}

                  {(isReschedule || form.status === 'scheduled') && (
                    <div>
                      <SchedulePicker
                        date={form.date}
                        time={form.time}
                        onDateChange={(value) => setField('date', value)}
                        onTimeChange={(value) => setField('time', value)}
                        dateError={errors.date}
                        timeError={errors.time}
                      />
                      <p className="mt-2 text-[11px] text-muted-foreground">
                        {t('timezone', { zone: timeZone })}
                      </p>
                    </div>
                  )}

                  {!isReschedule && (
                    <>
                      <div>
                        <Label
                          htmlFor={`${titleId}-caption`}
                          className="text-xs font-semibold text-foreground"
                        >
                          {t('form.captionLabel')}
                        </Label>
                        <Textarea
                          id={`${titleId}-caption`}
                          value={form.caption}
                          rows={4}
                          maxLength={5000}
                          aria-invalid={Boolean(errors.caption)}
                          aria-describedby={
                            errors.caption
                              ? `${titleId}-caption-error`
                              : undefined
                          }
                          onChange={(event) =>
                            setField('caption', event.target.value)
                          }
                          placeholder={t('form.captionPlaceholder')}
                          className={`mt-1.5 resize-y py-2.5 ${inputClassName}`}
                        />
                        <div className="flex items-start justify-between gap-3">
                          <FieldError
                            id={`${titleId}-caption-error`}
                            message={errors.caption}
                          />
                          <span className="ml-auto mt-1.5 text-[10px] tabular-nums text-muted-foreground">
                            {form.caption.length}/5000
                          </span>
                        </div>
                      </div>
                      <div>
                        <Label
                          htmlFor={`${titleId}-notes`}
                          className="text-xs font-semibold text-foreground"
                        >
                          {t('form.notesLabel')}
                        </Label>
                        <Textarea
                          id={`${titleId}-notes`}
                          value={form.notes}
                          rows={2}
                          maxLength={2000}
                          aria-invalid={Boolean(errors.notes)}
                          aria-describedby={
                            errors.notes ? `${titleId}-notes-error` : undefined
                          }
                          onChange={(event) =>
                            setField('notes', event.target.value)
                          }
                          placeholder={t('form.notesPlaceholder')}
                          className={`mt-1.5 resize-y py-2.5 ${inputClassName}`}
                        />
                        <FieldError
                          id={`${titleId}-notes-error`}
                          message={errors.notes}
                        />
                      </div>
                      <p className="rounded-md bg-muted px-3 py-2.5 text-[11px] leading-relaxed text-muted-foreground">
                        {t('form.publishNote')}
                      </p>
                    </>
                  )}
                </div>

                <div className="flex flex-col-reverse gap-2 px-5 py-4 sm:flex-row sm:items-center sm:px-6">
                  {mode === 'edit' && onDelete && (
                    <button
                      ref={deleteButtonRef}
                      type="button"
                      disabled={busy}
                      onClick={() => setConfirmDelete(true)}
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-3 text-xs font-semibold text-destructive transition-colors hover:bg-destructive/[0.07] disabled:opacity-50 sm:mr-auto"
                    >
                      <Trash2 className="h-4 w-4" />
                      {t('actions.delete')}
                    </button>
                  )}
                  <Button
                    type="button"
                    disabled={busy}
                    onClick={onClose}
                    variant="outline"
                    className=""
                  >
                    {t('actions.cancel')}
                  </Button>
                  <Button
                    type="submit"
                    disabled={busy}
                    variant="default"
                    className="disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {saving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : isReschedule ? (
                      <CalendarClock className="h-4 w-4" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                    {saving
                      ? t('actions.saving')
                      : isReschedule
                        ? t('actions.reschedule')
                        : mode === 'create'
                          ? t('actions.create')
                          : t('actions.save')}
                  </Button>
                </div>
              </form>
            )}
          </motion.div>
        </div>
      </div>
    </AnimatePresence>,
    document.body
  )
}
