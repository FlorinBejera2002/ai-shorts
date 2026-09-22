'use client'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LoadingIndicator } from '@/components/ui/loading-indicator'
import { PageHeader } from '@/components/ui/page-header'
import { Textarea } from '@/components/ui/textarea'
import { useTikTokCreatorOptions } from '@/hooks/use-tiktok-creator-options'
import { PublishingMediaPicker } from './publishing-media-picker'
import {
  incompatibleMediaPlatforms,
  unsupportedMetaVideos
} from './publishing-media-utils'

import type {
  CalendarClipOption,
  CalendarMutationStatus,
  ContentPlatform,
  PublishingMedia,
  ScheduledPostRecord
} from '@/lib/content-calendar'
import type { PublishingAccount, PublishingData } from '@/lib/publishing'
import {
  INITIAL_TIKTOK_SETTINGS,
  type TikTokDirectPostSettings,
  createCalendarTikTokPublishingOptions,
  resolveCalendarTikTokClip,
  settingsFromTikTokPublishingOptions,
  validateTikTokDirectPost
} from '@/lib/tiktok-direct-post'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  Check,
  ChevronLeft,
  ChevronRight,
  Film,
  Save,
  Search,
  Star,
  Timer,
  Trash2,
  Upload,
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
import { PlatformBrandIcon } from '@/components/publishing/platform-brand-icon'
import { PlatformOptionIcon } from './platform-mark'
import { SchedulePicker } from './schedule-picker'
import { TikTokPostSettings } from './tiktok-post-settings'
import { InstagramPostSettings as InstagramPostSettingsComponent } from './instagram-post-settings'
import {
  INITIAL_INSTAGRAM_SETTINGS,
  type InstagramPostSettings,
  createInstagramPublishingOptions,
  settingsFromInstagramPublishingOptions
} from '@/lib/instagram-post-settings'

import { YouTubePostSettings } from './youtube-post-settings'
import { initialYouTubeSettings, validateYouTubeSettings } from '@/lib/youtube-post-settings'

type DialogMode = 'create' | 'edit' | 'reschedule' | 'delete'

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
  media: PublishingMedia[]
}

type FormErrors = Partial<Record<keyof FormState | 'form' | 'tiktok' | 'instagram' | 'youtube', string>>

const inputClassName =
  'w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground shadow-none outline-none placeholder:text-muted-foreground/60 focus:border-border focus:ring-0 focus:shadow-none focus-visible:border-border focus-visible:ring-0 focus-visible:shadow-none'

const platformColors: Record<string, string> = {
  tiktok: 'border-foreground bg-foreground text-background shadow-sm',
  instagram: 'border-foreground bg-foreground text-background shadow-sm',
  youtube: 'border-foreground bg-foreground text-background shadow-sm',
  facebook: 'border-foreground bg-foreground text-background shadow-sm',
}

const staggerContainer = {
  hidden: { opacity: 1 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.05, delayChildren: 0.08 }
  }
}

const staggerItem = {
  hidden: { opacity: 0, y: 10 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] as const }
  }
} as const

function initialFormState(
  selectedDate: Date,
  publishingAccounts: PublishingAccount[],
  clips: CalendarClipOption[],
  post?: ScheduledPostRecord,
  initialTime?: string,
  initialClipId?: string
): FormState {
  const scheduledAt = post
    ? new Date(post.scheduledAt)
    : getDefaultPlanningTime(selectedDate)
  const availableAccountIds = new Set(
    publishingAccounts.map((account) => account.id)
  )
  const defaultAccount = publishingAccounts[0]
  const accountIds =
    post?.accountIds?.filter((accountId) =>
      availableAccountIds.has(accountId)
    ) ?? (defaultAccount ? [defaultAccount.id] : [])
  const selectedAccountIds = new Set(accountIds)
  const selectedProviders = publishingAccounts
    .filter((account) => selectedAccountIds.has(account.id))
    .map((account) => account.provider)
  const initialClip =
    !post && initialClipId
      ? clips.find((clip) => clip.id === initialClipId)
      : undefined

  return {
    title: post?.title ?? initialClip?.title ?? '',
    caption:
      post?.caption ??
      (initialClip ? captionFromClip(initialClip, selectedProviders) : ''),
    notes: post?.notes ?? '',
    platforms: [...new Set(selectedProviders)],
    accountIds,
    status: post?.status === 'draft' || post?.status === 'scheduled'
      ? post.status
      : 'draft',
    date: localDateKey(scheduledAt),
    time: post
      ? localTimeValue(scheduledAt)
      : (initialTime ?? localTimeValue(scheduledAt)),
    clipId: post?.clip?.id ?? initialClip?.id ?? '',
    media: post?.media ?? []
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
  presentation = 'dialog',
  mode,
  selectedDate,
  post,
  clips,
  publishingClips,
  publishingAccounts,
  platformConnectionsLoaded,
  youtubeAuditApproved = false,
  timeZone,
  initialTime,
  initialClipId,
  onClose,
  onSave,
  onDelete
}: {
  presentation?: 'dialog' | 'page'
  mode: DialogMode
  selectedDate: Date
  post?: ScheduledPostRecord
  clips: CalendarClipOption[]
  publishingClips: PublishingData['clips']
  publishingAccounts: PublishingAccount[]
  platformConnectionsLoaded: boolean
  youtubeAuditApproved?: boolean
  timeZone: string
  initialTime?: string
  initialClipId?: string
  onClose: () => void
  onSave: (payload: PostFormPayload) => Promise<void>
  onDelete?: (platforms: ContentPlatform[]) => Promise<void>
}) {
  const t = useTranslations('contentCalendar')
  const isPage = presentation === 'page'
  const FieldsContainer = isPage ? Card : 'div'
  const publishingT = useTranslations('publishing')
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
    initialFormState(
      selectedDate,
      publishingAccounts,
      clips,
      post,
      initialTime,
      initialClipId
    )
  )
  const [errors, setErrors] = useState<FormErrors>({})
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [mediaSource, setMediaSource] = useState<'clip' | 'upload'>('clip')
  const [clipSearch, setClipSearch] = useState('')
  const [clipPage, setClipPage] = useState(0)
  const [confirmDelete, setConfirmDelete] = useState(mode === 'delete')
  const [deletePlatforms, setDeletePlatforms] = useState<ContentPlatform[]>([])
  const [tiktokSettings, setTikTokSettings] =
    useState<TikTokDirectPostSettings>(() =>
      settingsFromTikTokPublishingOptions(post?.tiktok)
    )
  const [instagramSettings, setInstagramSettings] =
    useState<InstagramPostSettings>(() =>
      settingsFromInstagramPublishingOptions(post?.instagram)
    )
  const [youtubeSettings, setYouTubeSettings] = useState(() => initialYouTubeSettings(post?.youtube))
  const busy = saving || deleting || uploading

  const publishedProviders = useMemo(
    () => [
      ...new Set(
        (post?.publishingDestinations ?? [])
          .filter((destination) => destination.status === 'published')
          .map((destination) => destination.provider)
      )
    ],
    [post?.publishingDestinations]
  )
  const canDeleteFromFacebook = publishedProviders.includes('facebook')
  const canDeleteFromLinkedIn = publishedProviders.includes('linkedin')
  const requiresManualInstagramDelete = publishedProviders.includes('instagram')
  const selectedAccountIds = useMemo(
    () => new Set(form.accountIds),
    [form.accountIds]
  )
  const selectedYouTubeAccounts = publishingAccounts.filter(account => account.provider === 'youtube' && selectedAccountIds.has(account.id))
  const selectedTikTokAccounts = useMemo(
    () =>
      publishingAccounts.filter(
        (account) =>
          account.provider === 'tiktok' && selectedAccountIds.has(account.id)
      ),
    [publishingAccounts, selectedAccountIds]
  )
  const selectedTikTokAccount = selectedTikTokAccounts[0]
  const selectedInstagramAccounts = useMemo(
    () =>
      publishingAccounts.filter(
        (account) =>
          account.provider === 'instagram' && selectedAccountIds.has(account.id)
      ),
    [publishingAccounts, selectedAccountIds]
  )
  const selectedInstagramAccount = selectedInstagramAccounts[0]
  const isTikTokPhotoPost =
    selectedTikTokAccounts.length > 0 &&
    form.media.length > 0 &&
    form.media.every((item) => item.type === 'image')
  const isInstagramPhotoPost = useMemo(() => {
    if (selectedInstagramAccounts.length === 0) return false
    if (form.clipId) return false
    return form.media.length > 0 && form.media.every((m) => m.type === 'image')
  }, [selectedInstagramAccounts.length, form.clipId, form.media])
  const captionLimit = selectedTikTokAccounts.length > 0
    ? isTikTokPhotoPost
        ? 4000
        : 2200
      : 5000
  const { state: tiktokOptionsState, retry: retryTikTokOptions } =
    useTikTokCreatorOptions(selectedTikTokAccount?.id)
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
  const selectedTikTokClip = resolveCalendarTikTokClip({
    calendarClips: selectableClips,
    clipId: form.clipId,
    publishingClips
  })

  useEffect(() => {
    onCloseRef.current = onClose
    busyRef.current = busy
  }, [onClose, busy])

  useEffect(() => {
    setMounted(true)
    if (isPage) return
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
  }, [isPage])

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
    if (field === 'media' || field === 'clipId') {
      setYouTubeSettings(current => ({ ...current, termsAccepted: false }))
    }
    setForm((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({
      ...current,
      [field]: undefined,
      form: undefined
    }))
  }

  function toggleAccount(account: PublishingAccount) {
    const removing = selectedAccountIds.has(account.id)
    if (account.provider === 'tiktok') {
      const replacingAccount =
        !removing && selectedTikTokAccount?.id !== account.id
      if (removing || replacingAccount) {
        setTikTokSettings({ ...INITIAL_TIKTOK_SETTINGS })
      }
    }
    if (account.provider === 'youtube') setYouTubeSettings(current => ({ ...current, termsAccepted: false }))
    if (account.provider === 'instagram') {
      const replacingAccount =
        !removing && selectedInstagramAccount?.id !== account.id
      if (removing || replacingAccount) {
        setInstagramSettings({ ...INITIAL_INSTAGRAM_SETTINGS })
      }
    }
    setForm((current) => {
      const currentAccountIds = new Set(current.accountIds)
      const removed = currentAccountIds.delete(account.id)
      if (!removed) {
        if (account.provider === 'tiktok') {
          for (const candidate of publishingAccounts) {
            if (candidate.provider === 'tiktok') {
              currentAccountIds.delete(candidate.id)
            }
          }
        }
        currentAccountIds.add(account.id)
      }
      const nextAccountIds = [...currentAccountIds]
      const selectedProviders = new Set(
        publishingAccounts
          .filter((candidate) => currentAccountIds.has(candidate.id))
          .map((candidate) => candidate.provider)
      )
      return {
        ...current,
        accountIds: nextAccountIds,
        platforms: [...selectedProviders],
        media: !removed && account.provider === 'tiktok' ? [] : current.media
      }
    })
    setErrors((current) => ({
      ...current,
      platforms: undefined,
      accountIds: undefined,
      media: undefined,
      clipId: undefined,
      form: undefined
    }))
  }

  function updateTikTokSetting<Key extends keyof TikTokDirectPostSettings>(
    key: Key,
    value: TikTokDirectPostSettings[Key]
  ) {
    setTikTokSettings((current) => ({
      ...current,
      [key]: value,
      ...(key === 'commercialContent' && value === false
        ? { ownBrand: false, brandedContent: false }
        : {}),
      ...(key === 'privacyLevel' && value === 'SELF_ONLY'
        ? { brandedContent: false }
        : {}),
      ...(key === 'commercialContent' ||
      key === 'ownBrand' ||
      key === 'brandedContent'
        ? { policyConsent: false }
        : {})
    }))
    setErrors((current) => ({
      ...current,
      tiktok: undefined,
      form: undefined
    }))
  }

  function handleClipChange(clipId: string) {
    setYouTubeSettings(current => ({ ...current, termsAccepted: false }))
    const clip = selectableClips.find((item) => item.id === clipId)
    setForm((current) => ({
      ...current,
      clipId,
      media: clipId ? [] : current.media,
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
    const tiktokValidationErrors = selectedTikTokAccounts.length
      ? validateTikTokDirectPost({
          accountId:
            selectedTikTokAccounts.length === 1
              ? (selectedTikTokAccount?.id ?? '')
              : '',
          caption: form.caption,
          clip: selectedTikTokClip,
          media: form.media,
          title: form.title.trim(),
          options: tiktokOptionsState.value,
          settings: tiktokSettings
        })
      : []

    if (mode !== 'reschedule') {
      if (form.status !== 'draft' && selectedYouTubeAccounts.length && !validateYouTubeSettings(youtubeSettings, youtubeAuditApproved)) nextErrors.youtube = publishingT('youtubeSettingsRequired')
      if (!form.title.trim()) nextErrors.title = t('validation.titleRequired')
      else if (form.title.trim().length > 120) {
        nextErrors.title = t('validation.titleLength')
      }
      if (form.caption.length > captionLimit) {
        nextErrors.caption =
          captionLimit === 5000
            ? t('validation.captionLength')
            : t('validation.platformCaptionLength', { limit: captionLimit })
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
      const unsupportedVideos = unsupportedMetaVideos(
        form.media,
        form.platforms
      )
      if (form.status !== 'draft' && unsupportedVideos.length) {
        nextErrors.media = t('validation.mediaVideoFormat', {
          names: unsupportedVideos.join(', ')
        })
      }
      const incompatible = incompatibleMediaPlatforms(
        form.media,
        form.platforms
      )
      if (form.status !== 'draft' && incompatible.length) {
        nextErrors.media = t(
          incompatible.includes('tiktok')
            ? 'validation.mediaTikTokUnsupported'
            : 'validation.mediaPlatformUnsupported',
          {
            platforms: incompatible.join(', ')
          }
        )
      }
      if (form.status !== 'draft' && !form.clipId && form.media.length === 0) {
        nextErrors.clipId = t('validation.clipRequired')
      }
      if (form.status !== 'draft' && selectedTikTokAccounts.length > 0) {
        if (selectedTikTokAccounts.length !== 1) {
          nextErrors.accountIds = t('validation.tiktokAccountRequired')
        }
        if (
          tiktokValidationErrors.includes('clipRequired') ||
          tiktokValidationErrors.includes('clipIneligible')
        ) {
          nextErrors.clipId = t('validation.tiktokClipRequired')
        } else if (tiktokValidationErrors.includes('clipTooLong')) {
          nextErrors.clipId = publishingT('tooLong')
        }
        if (tiktokValidationErrors.includes('captionTooLong')) {
          nextErrors.caption = t('validation.tiktokCaptionLength', {
            limit: captionLimit
          })
        }
        if (tiktokValidationErrors.includes('photoTitleTooLong')) {
          nextErrors.title = t('validation.tiktokPhotoTitleLength')
        }
        if (tiktokValidationErrors.includes('commercialTypeRequired')) {
          nextErrors.tiktok = publishingT('commercialTypeRequired')
        } else if (tiktokValidationErrors.includes('brandedContentPrivacy')) {
          nextErrors.tiktok = publishingT('brandPrivacy')
        } else if (
          tiktokValidationErrors.includes('creatorOptionsRequired') ||
          tiktokValidationErrors.includes('privacyRequired') ||
          tiktokValidationErrors.includes('privacyUnavailable') ||
          tiktokValidationErrors.includes('policyConsentRequired')
        ) {
          nextErrors.tiktok = t('validation.tiktokSettingsRequired')
        }
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

    const tiktok = createCalendarTikTokPublishingOptions({
      creatorOptions: tiktokOptionsState.value,
      isPhotoPost: isTikTokPhotoPost,
      photoTitle: form.title.trim(),
      selectedAccountCount: selectedTikTokAccounts.length,
      settings: tiktokSettings,
      status: form.status,
      validationErrors: tiktokValidationErrors
    })

    const instagram = selectedInstagramAccounts.length > 0
      ? createInstagramPublishingOptions(instagramSettings)
      : undefined

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
        clipId: form.clipId || null,
        media: form.media,
        ...(tiktok ? { tiktok } : {}),
        ...(instagram ? { instagram } : {}),
        ...(selectedYouTubeAccounts.length ? { youtube: youtubeSettings } : {})
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
        fieldErrors.caption =
          selectedTikTokAccounts.length > 0
            ? t('validation.tiktokCaptionLength', { limit: captionLimit })
            : captionLimit < 5000
              ? t('validation.platformCaptionLength', { limit: captionLimit })
              : t('validation.captionLength')
      } else if (issue.field === 'notes') {
        fieldErrors.notes = t('validation.notesLength')
      } else if (issue.field === 'platforms') {
        fieldErrors.platforms = t('validation.platformRequired')
      } else if (issue.field === 'accountIds') {
        fieldErrors.accountIds =
          selectedTikTokAccounts.length > 0
            ? t('validation.tiktokAccountRequired')
            : t('validation.accountRequired')
      } else if (issue.field === 'scheduledAt') {
        fieldErrors.date = t('validation.dateInvalid')
      } else if (issue.field === 'clipId') {
        fieldErrors.clipId =
          issue.message ||
          (selectedTikTokAccounts.length > 0
            ? t('validation.tiktokClipRequired')
            : t('validation.clipInvalid'))
      } else if (issue.field === 'media') {
        fieldErrors.media = issue.message
      } else if (issue.field === 'status') {
        fieldErrors.status = t('validation.statusInvalid')
      } else if (issue.field === 'tiktok') {
        fieldErrors.tiktok = t('validation.tiktokSettingsRequired')
      } else if (issue.field === 'instagram') {
        fieldErrors.instagram = t('validation.instagramSettingsRequired')
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
      await onDelete(deletePlatforms)
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
      if (mode !== 'delete') setConfirmDelete(false)
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

  const platformSelection = (
    <fieldset
      className="pt-1"
      aria-describedby={
        errors.platforms ? `${titleId}-platforms-error` : undefined
      }
    >
      <legend className="text-xs font-semibold text-foreground">
        {t('form.platformsLabel')}
      </legend>
      <div
        className={
          isPage
            ? 'mt-4 grid grid-cols-1 gap-2'
            : 'mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2'
        }
      >
        {publishingAccounts.map((account) => {
          const selected = selectedAccountIds.has(account.id)
          return (
            <motion.button
              key={account.id}
              type="button"
              aria-pressed={selected}
              disabled={busy}
              onClick={() => toggleAccount(account)}
              whileTap={reduceMotion ? undefined : { scale: 0.97 }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
              className={`relative flex min-h-11 items-center gap-2 rounded-lg border px-3 text-xs font-semibold transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-60 ${
                selected
                  ? (platformColors[account.provider] ?? 'border-primary/40 bg-primary/5 text-foreground')
                  : 'border-border bg-background text-muted-foreground hover:border-foreground/20 hover:bg-muted hover:text-foreground hover:shadow-sm'
              }`}
            >
              <PlatformBrandIcon provider={account.provider} className="h-5 w-5" />
              <span className="min-w-0 truncate">
                {account.username ? `@${account.username}` : account.name}
              </span>
              <span className="ml-auto text-[10px] opacity-60">
                {t(`platforms.${account.provider}`)}
              </span>
              <AnimatePresence>
                {selected && (
                  <motion.span
                    initial={reduceMotion ? false : { scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0, opacity: 0 }}
                    transition={{
                      type: 'spring',
                      stiffness: 500,
                      damping: 20
                    }}
                    className="flex size-5 items-center justify-center rounded-full bg-foreground/10"
                  >
                    <Check className="size-3" />
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.button>
          )
        })}
      </div>
      {platformConnectionsLoaded && publishingAccounts.length === 0 && (
        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/45 px-3 py-2 text-[11px] text-muted-foreground">
          <span>{t('form.closeToConnect')}</span>
          <button
            type="button"
            onClick={onClose}
            className="font-semibold text-foreground underline-offset-4 hover:underline"
          >
            {t('form.closeAndConnect')}
          </button>
        </div>
      )}
      <FieldError
        id={`${titleId}-platforms-error`}
        message={errors.platforms ?? errors.accountIds}
      />
    </fieldset>
  )

  const content = (
    <AnimatePresence>
      <div
        className={
          isPage
            ? `${styles.workspace} dashboard-workspace`
            : 'fixed inset-0 z-[120] overflow-y-auto'
        }
      >
        {isPage && (
          <PageHeader
            title={dialogTitle}
            description={t('page.description')}
            actions={
              <Button
                type="button"
                variant="outline"
                className="text-foreground"
                onClick={onClose}
                disabled={busy}
              >
                <ArrowLeft className="size-4" />
                {t('page.back')}
              </Button>
            }
          />
        )}
        {!isPage && (
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
        )}
        <div
          className={
            isPage
              ? 'w-full'
              : 'flex min-h-full items-end justify-center p-0 sm:items-center sm:p-5'
          }
        >
          <motion.div
            ref={dialogRef}
            role={isPage ? 'region' : confirmDelete ? 'alertdialog' : 'dialog'}
            aria-modal={isPage ? undefined : true}
            aria-label={isPage ? dialogTitle : undefined}
            aria-labelledby={isPage ? undefined : titleId}
            aria-busy={busy}
            initial={
              isPage || reduceMotion
                ? false
                : { opacity: 0, y: 24, scale: 0.97 }
            }
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            onMouseDown={(event) => event.stopPropagation()}
            className={
              isPage
                ? styles.editorPage
                : `${styles.dialog} relative z-10 flex max-h-[min(94dvh,54rem)] w-full max-w-2xl flex-col overflow-hidden rounded-t-md border border-border bg-card text-card-foreground shadow-2xl sm:rounded-md`
            }
          >
            {!isPage && (
              <div className="relative border-b bg-card px-5 py-4 sm:px-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-foreground">
                      <CalendarClock className="h-4 w-4" />
                    </span>
                    <h2
                      id={titleId}
                      className="truncate text-xl font-semibold tracking-tight"
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
            )}

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
                <div className="mt-4 space-y-2">
                  <div className="rounded-md border bg-muted/35 px-3.5 py-3">
                    <p className="text-xs font-semibold">
                      {t('dialog.calendarRemovalTitle')}
                    </p>
                    <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                      {t('dialog.calendarRemovalDescription')}
                    </p>
                  </div>
                  {canDeleteFromFacebook && (
                    <button
                      type="button"
                      aria-pressed={deletePlatforms.includes('facebook')}
                      disabled={busy}
                      onClick={() =>
                        setDeletePlatforms((current) =>
                          current.includes('facebook')
                            ? current.filter(
                                (platform) => platform !== 'facebook'
                              )
                            : [...current, 'facebook']
                        )
                      }
                      className="flex w-full items-center gap-3 rounded-md border px-3.5 py-3 text-left transition-colors hover:bg-muted disabled:opacity-50"
                    >
                      <span
                        className={`inline-flex size-5 shrink-0 items-center justify-center rounded-sm border ${
                          deletePlatforms.includes('facebook')
                            ? 'border-foreground bg-foreground text-background'
                            : 'border-border bg-background'
                        }`}
                      >
                        {deletePlatforms.includes('facebook') && (
                          <Check className="size-3.5" />
                        )}
                      </span>
                      <PlatformOptionIcon platform="facebook" />
                      <span className="min-w-0">
                        <span className="block text-xs font-semibold">
                          {t('dialog.deleteFromFacebook')}
                        </span>
                        <span className="mt-0.5 block text-[11px] text-muted-foreground">
                          {t('dialog.deleteFromFacebookDescription')}
                        </span>
                      </span>
                    </button>
                  )}
                  {canDeleteFromLinkedIn && (
                    <button
                      type="button"
                      aria-pressed={deletePlatforms.includes('linkedin')}
                      disabled={busy}
                      onClick={() =>
                        setDeletePlatforms((current) =>
                          current.includes('linkedin')
                            ? current.filter(
                                (platform) => platform !== 'linkedin'
                              )
                            : [...current, 'linkedin']
                        )
                      }
                      className="flex w-full items-center gap-3 rounded-md border px-3.5 py-3 text-left transition-colors hover:bg-muted disabled:opacity-50"
                    >
                      <span
                        className={`inline-flex size-5 shrink-0 items-center justify-center rounded-sm border ${
                          deletePlatforms.includes('linkedin')
                            ? 'border-foreground bg-foreground text-background'
                            : 'border-border bg-background'
                        }`}
                      >
                        {deletePlatforms.includes('linkedin') && (
                          <Check className="size-3.5" />
                        )}
                      </span>
                      <PlatformOptionIcon platform="linkedin" />
                      <span className="min-w-0">
                        <span className="block text-xs font-semibold">
                          {t('dialog.deleteFromLinkedIn')}
                        </span>
                        <span className="mt-0.5 block text-[11px] text-muted-foreground">
                          {t('dialog.deleteFromLinkedInDescription')}
                        </span>
                      </span>
                    </button>
                  )}
                  {requiresManualInstagramDelete && (
                    <div className="flex items-center gap-3 rounded-md border bg-muted/25 px-3.5 py-3">
                      <PlatformOptionIcon platform="instagram" />
                      <span className="min-w-0">
                        <span className="block text-xs font-semibold">
                          {t('dialog.instagramManualDelete')}
                        </span>
                        <span className="mt-0.5 block text-[11px] leading-5 text-muted-foreground">
                          {t('dialog.instagramManualDeleteDescription')}
                        </span>
                      </span>
                    </div>
                  )}
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
                    onClick={() =>
                      mode === 'delete' ? onClose() : setConfirmDelete(false)
                    }
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
                      <LoadingIndicator className="h-4 w-4" />
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
                className={
                  isPage ? styles.editorLayout : 'flex min-h-0 flex-1 flex-col'
                }
              >
                {isPage && (
                  <Card as="aside" className={styles.editorPlatforms}>
                    {platformSelection}
                  </Card>
                )}
                <FieldsContainer
                  className={isPage ? styles.editorContent : 'contents'}
                >
                  <motion.div
                    layoutScroll={!isPage}
                    variants={isPage && !reduceMotion ? staggerContainer : undefined}
                    initial={isPage && !reduceMotion ? 'hidden' : false}
                    animate="show"
                    className={
                      isPage
                        ? styles.editorFields
                        : 'min-h-0 flex-1 space-y-7 overflow-y-auto px-5 py-5 sm:px-6 sm:py-6'
                    }
                  >
                    {errors.form && (
                      <motion.div
                        role="alert"
                        initial={reduceMotion ? false : { opacity: 0, scale: 0.98 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="rounded-md border border-destructive/25 bg-destructive/[0.06] px-3 py-2.5 text-xs font-medium text-destructive"
                      >
                        {errors.form}
                      </motion.div>
                    )}

                    {!isReschedule && (
                      <>
                        <motion.div variants={isPage ? staggerItem : undefined}>
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
                            maxLength={isTikTokPhotoPost ? 90 : 120}
                            required={true}
                            aria-invalid={Boolean(errors.title)}
                            aria-describedby={
                              errors.title
                                ? `${titleId}-title-error`
                                : undefined
                            }
                            onChange={(event) =>
                              setField('title', event.target.value)
                            }
                            placeholder={t('form.titlePlaceholder')}
                            className={`mt-2 h-11 ${inputClassName}`}
                          />
                          <div className="flex items-start justify-between gap-3">
                            <FieldError
                              id={`${titleId}-title-error`}
                              message={errors.title}
                            />
                            <span className="ml-auto mt-1.5 text-[10px] tabular-nums text-muted-foreground">
                              {form.title.length}/{isTikTokPhotoPost ? 90 : 120}
                            </span>
                          </div>
                        </motion.div>

                        {!isPage && platformSelection}

                        <motion.div
                          variants={isPage ? staggerItem : undefined}
                          className={`space-y-4 ${isPage ? styles.editorWide : ''}`}
                        >
                          <Label className="text-xs font-semibold text-foreground">{t('form.mediaSectionTitle')}</Label>
                          <div className="mt-1.5 flex gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setMediaSource('clip')
                                setForm((current) => ({ ...current, media: [] }))
                                setErrors((current) => ({ ...current, media: undefined }))
                              }}
                              className={`flex items-center gap-2 rounded-lg border px-3.5 py-2 text-xs font-medium transition-colors ${
                                mediaSource === 'clip'
                                  ? 'border-foreground/20 bg-foreground/5 text-foreground'
                                  : 'border-border text-muted-foreground hover:border-foreground/15 hover:text-foreground'
                              }`}
                            >
                              <Film className="size-3.5" />
                              {t('form.mediaSourceClip')}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setMediaSource('upload')
                                handleClipChange('')
                              }}
                              className={`flex items-center gap-2 rounded-lg border px-3.5 py-2 text-xs font-medium transition-colors ${
                                mediaSource === 'upload'
                                  ? 'border-foreground/20 bg-foreground/5 text-foreground'
                                  : 'border-border text-muted-foreground hover:border-foreground/15 hover:text-foreground'
                              }`}
                            >
                              <Upload className="size-3.5" />
                              {t('form.mediaSourceUpload')}
                            </button>
                          </div>

                          <AnimatePresence mode="wait">
                            {mediaSource === 'upload' ? (
                              <motion.div
                                key="upload"
                                initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -6 }}
                                transition={{ duration: 0.2 }}
                              >
                                <PublishingMediaPicker
                                  media={form.media}
                                  disabled={busy}
                                  error={errors.media}
                                  onUploadingChange={setUploading}
                                  onError={(message) =>
                                    setErrors((current) => ({
                                      ...current,
                                      media: message
                                    }))
                                  }
                                  onChange={(media) => {
                                    setForm((current) => ({
                                      ...current,
                                      media,
                                      clipId: media.length ? '' : current.clipId
                                    }))
                                    setErrors((current) => ({
                                      ...current,
                                      media: undefined,
                                      clipId: undefined,
                                      form: undefined
                                    }))
                                  }}
                                />
                                {selectedTikTokAccounts.length > 0 && (
                                  <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
                                    {t('form.mediaTikTokHint')}
                                  </p>
                                )}
                              </motion.div>
                            ) : (
                              <motion.div
                                key="clip"
                                initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -6 }}
                                transition={{ duration: 0.2 }}
                                className="space-y-3"
                              >
                                {selectableClips.length > 15 && (
                                  <div className="relative">
                                    <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3 -translate-y-1/2 text-muted-foreground" />
                                    <input
                                      type="text"
                                      value={clipSearch}
                                      onChange={(e) => { setClipSearch(e.target.value); setClipPage(0) }}
                                      placeholder={t('form.clipSearchPlaceholder')}
                                      className={`h-8 w-48 rounded-lg border border-border bg-background pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground ${inputClassName}`}
                                    />
                                  </div>
                                )}

                                {(() => {
                                  const filtered = selectableClips.filter((c) =>
                                    c.title.toLowerCase().includes(clipSearch.toLowerCase())
                                  )
                                  const isMobile = typeof window !== 'undefined' && window.innerWidth < 640
                                  const perPage = isMobile ? 4 : 6
                                  const cols = isMobile ? 2 : 3
                                  const totalPages = Math.ceil(filtered.length / perPage)
                                  const page = Math.min(clipPage, Math.max(0, totalPages - 1))
                                  const paged = filtered.slice(page * perPage, (page + 1) * perPage)

                                  return (
                                    <>
                                      <div className={`grid gap-2 ${cols === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
                                        {paged.map((clip) => (
                                          <button
                                            key={clip.id}
                                            type="button"
                                            onClick={() => handleClipChange(form.clipId === clip.id ? '' : clip.id)}
                                            className={`group relative flex flex-col overflow-hidden rounded-lg border text-left transition-all ${
                                              form.clipId === clip.id
                                                ? 'border-foreground/30 bg-foreground/[0.03] ring-1 ring-foreground/10'
                                                : 'border-border hover:border-foreground/15'
                                            }`}
                                          >
                                            <div className="relative aspect-video w-full overflow-hidden bg-gradient-to-br from-[#0f172a] to-[#1e3a5f]">
                                              {clip.thumbnailUrl ? (
                                                <img src={clip.thumbnailUrl} alt="" className="absolute inset-0 size-full object-cover" />
                                              ) : (
                                                <div className="flex size-full items-center justify-center">
                                                  <Film className="size-5 text-white/30" />
                                                </div>
                                              )}
                                              <div className="absolute bottom-1 right-1 flex items-center gap-0.5 rounded bg-black/60 px-1 py-px text-[9px] font-medium tabular-nums text-white/90 backdrop-blur-sm">
                                                <Timer className="size-2" />
                                                {Math.floor(clip.duration / 60)}:{String(Math.round(clip.duration % 60)).padStart(2, '0')}
                                              </div>
                                              {form.clipId === clip.id && (
                                                <div className="absolute inset-0 flex items-center justify-center bg-foreground/20 backdrop-blur-[1px]">
                                                  <div className="flex size-8 items-center justify-center rounded-full bg-foreground shadow-lg">
                                                    <Check className="size-4 text-background" />
                                                  </div>
                                                </div>
                                              )}
                                            </div>
                                            <div className="flex flex-col gap-1 p-1.5">
                                              <p className="line-clamp-1 text-[11px] font-medium text-foreground">
                                                {clip.title}
                                              </p>
                                              <div className="flex items-center gap-1">
                                                <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold text-amber-600 dark:text-amber-400">
                                                  <Star className="size-2 fill-current" />
                                                  {clip.viralScore}
                                                </span>
                                                {clip.tiktokEligible && (
                                                  <span className="text-[9px] font-medium text-teal-600 dark:text-teal-400">
                                                    TikTok
                                                  </span>
                                                )}
                                              </div>
                                            </div>
                                          </button>
                                        ))}
                                      </div>

                                      {filtered.length === 0 && (
                                        <p className="py-4 text-center text-xs text-muted-foreground">
                                          {t('form.noClipsFound')}
                                        </p>
                                      )}

                                      {totalPages > 1 && (
                                        <div className="flex items-center justify-center gap-2 pt-1">
                                          <button
                                            type="button"
                                            disabled={page === 0}
                                            onClick={() => setClipPage(page - 1)}
                                            className="flex size-7 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
                                          >
                                            <ChevronLeft className="size-3.5" />
                                          </button>
                                          <span className="text-[11px] tabular-nums text-muted-foreground">
                                            {page + 1} / {totalPages}
                                          </span>
                                          <button
                                            type="button"
                                            disabled={page >= totalPages - 1}
                                            onClick={() => setClipPage(page + 1)}
                                            className="flex size-7 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
                                          >
                                            <ChevronRight className="size-3.5" />
                                          </button>
                                        </div>
                                      )}

                                      <FieldError
                                        id={`${titleId}-clip-error`}
                                        message={errors.clipId}
                                      />
                                    </>
                                  )
                                })()}
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </motion.div>

                        <motion.div
                          variants={isPage ? staggerItem : undefined}
                          className={isPage ? styles.editorWide : ''}
                        >
                          <Label className="text-xs font-semibold text-foreground">
                            {t('form.statusLabel')}
                          </Label>
                          <div className="mt-1.5 flex gap-2">
                            {EDITABLE_CALENDAR_STATUSES.map((status) => {
                              const isActive = form.status === status
                              const colorMap: Record<string, { active: string; idle: string }> = {
                                draft: {
                                  active: 'border-amber-400/40 bg-amber-500/10 text-amber-700 dark:text-amber-400',
                                  idle: 'border-border text-muted-foreground hover:border-amber-300/30 hover:text-amber-700 dark:hover:text-amber-400'
                                },
                                scheduled: {
                                  active: 'border-blue-400/40 bg-blue-500/10 text-blue-700 dark:text-blue-400',
                                  idle: 'border-border text-muted-foreground hover:border-blue-300/30 hover:text-blue-700 dark:hover:text-blue-400'
                                },
                                publish: {
                                  active: 'border-emerald-400/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
                                  idle: 'border-border text-muted-foreground hover:border-emerald-300/30 hover:text-emerald-700 dark:hover:text-emerald-400'
                                }
                              }
                              const colors = colorMap[status] ?? colorMap['draft']!
                              return (
                                <button
                                  key={status}
                                  type="button"
                                  onClick={() => setField('status', status)}
                                  className={`w-fit rounded-md border px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
                                    isActive ? colors.active : colors.idle
                                  }`}
                                >
                                  {t(`statuses.${status}`)}
                                </button>
                              )
                            })}
                          </div>
                          <FieldError
                            id={`${titleId}-status-error`}
                            message={errors.status}
                          />
                        </motion.div>
                      </>
                    )}

                    {(isReschedule || form.status === 'scheduled') && (
                      <motion.div
                        variants={isPage ? staggerItem : undefined}
                        className="pt-1"
                      >
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
                      </motion.div>
                    )}

                    {!isReschedule && (
                      <>
                        <motion.div
                          variants={isPage ? staggerItem : undefined}
                          className={isPage ? styles.editorWide : 'pt-1'}
                        >
                          <Label
                            htmlFor={`${titleId}-caption`}
                            className="text-xs font-semibold text-foreground"
                          >
                            {selectedTikTokAccounts.length > 0
                              ? t('form.captionLabelTikTok')
                              : t('form.captionLabel')}
                          </Label>
                          <Textarea
                            id={`${titleId}-caption`}
                            value={form.caption}
                            rows={4}
                            maxLength={captionLimit}
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
                            className={`mt-2 min-h-32 resize-y py-3 leading-6 ${inputClassName}`}
                          />
                          <div className="flex items-start justify-between gap-3">
                            <FieldError
                              id={`${titleId}-caption-error`}
                              message={errors.caption}
                            />
                            <span className="ml-auto mt-1.5 text-[10px] tabular-nums text-muted-foreground">
                              {form.caption.length}/{captionLimit}
                            </span>
                          </div>
                        </motion.div>
                        {selectedTikTokAccount && (
                          <motion.div
                            variants={isPage ? staggerItem : undefined}
                            className={`space-y-2 pt-1 ${isPage ? styles.editorWide : ''}`}
                          >
                            <TikTokPostSettings
                              isPhotoPost={isTikTokPhotoPost}
                              clip={selectedTikTokClip}
                              disabled={busy}
                              idPrefix={`${titleId}-tiktok`}
                              settings={tiktokSettings}
                              optionsState={tiktokOptionsState}
                              onChange={updateTikTokSetting}
                              onRetry={retryTikTokOptions}
                            />
                            <FieldError
                              id={`${titleId}-tiktok-error`}
                              message={errors.tiktok}
                            />
                          </motion.div>
                        )}
                        {selectedYouTubeAccounts.length > 0 && (
                          <div className={isPage ? styles.editorWide : ''}>
                            <YouTubePostSettings settings={youtubeSettings} onChange={setYouTubeSettings} auditApproved={youtubeAuditApproved} channelNames={selectedYouTubeAccounts.map(account => account.name).join(', ')} disabled={busy} idPrefix={titleId + '-youtube'} />
                            <FieldError id={titleId + '-youtube-error'} message={errors.youtube} />
                          </div>
                        )}
                        {selectedInstagramAccount && (
                          <motion.div
                            variants={isPage ? staggerItem : undefined}
                            className={`space-y-2 pt-1 ${isPage ? styles.editorWide : ''}`}
                          >
                            <InstagramPostSettingsComponent
                              disabled={busy}
                              idPrefix={`${titleId}-instagram`}
                              isVideoPost={!isInstagramPhotoPost}
                              onChange={(key, value) =>
                                setInstagramSettings((prev) => ({ ...prev, [key]: value }))
                              }
                              settings={instagramSettings}
                            />
                            <FieldError
                              id={`${titleId}-instagram-error`}
                              message={errors.instagram}
                            />
                          </motion.div>
                        )}
                        <motion.div
                          variants={isPage ? staggerItem : undefined}
                          className={isPage ? styles.editorWide : 'pt-1'}
                        >
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
                              errors.notes
                                ? `${titleId}-notes-error`
                                : undefined
                            }
                            onChange={(event) =>
                              setField('notes', event.target.value)
                            }
                            placeholder={t('form.notesPlaceholder')}
                            className={`mt-2 min-h-24 resize-y py-3 leading-6 ${inputClassName}`}
                          />
                          <FieldError
                            id={`${titleId}-notes-error`}
                            message={errors.notes}
                          />
                        </motion.div>
                      </>
                    )}
                  </motion.div>
                </FieldsContainer>

                <motion.div
                  initial={isPage && !reduceMotion ? { opacity: 0, y: 8 } : false}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3, duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                  className={
                    isPage
                      ? `${styles.editorActions} flex flex-col-reverse gap-2.5 pt-4 sm:flex-row sm:justify-end sm:items-center`
                      : 'flex flex-col-reverse gap-2 border-t bg-card px-5 py-4 shadow-[0_-8px_24px_-20px_rgba(0,0,0,0.35)] sm:flex-row sm:items-center sm:px-7'
                  }
                >
                  {mode === 'edit' && onDelete && (
                    <motion.button
                      ref={deleteButtonRef}
                      type="button"
                      disabled={busy}
                      onClick={() => setConfirmDelete(true)}
                      whileHover={reduceMotion ? undefined : { scale: 1.02 }}
                      whileTap={reduceMotion ? undefined : { scale: 0.97 }}
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 text-xs font-semibold text-destructive transition-colors hover:bg-destructive/[0.07] disabled:opacity-50 sm:mr-auto"
                    >
                      <Trash2 className="h-4 w-4" />
                      {t('actions.delete')}
                    </motion.button>
                  )}
                  <Button
                    type="button"
                    disabled={busy}
                    onClick={onClose}
                    variant="outline"
                    className="transition-all duration-200 hover:shadow-sm"
                  >
                    {t('actions.cancel')}
                  </Button>
                  <motion.div
                    whileHover={reduceMotion ? undefined : { scale: 1.02 }}
                    whileTap={reduceMotion ? undefined : { scale: 0.97 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                  >
                    <Button
                      type="submit"
                      disabled={busy}
                      variant="default"
                      className="w-full sm:w-auto"
                    >
                      {saving ? (
                        <LoadingIndicator className="h-4 w-4" />
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
                  </motion.div>
                </motion.div>
              </form>
            )}
          </motion.div>
        </div>
      </div>
    </AnimatePresence>
  )
  return isPage ? content : createPortal(content, document.body)
}
