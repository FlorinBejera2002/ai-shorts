'use client'

import { PublishingPlatformIcon } from '@/components/publishing/publishing-platform-icon'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useIsMobile } from '@/hooks/use-mobile'
import type { CalendarClipOption, CalendarMutationStatus, ContentPlatform, PublishingMedia, ScheduledPostRecord } from '@/lib/content-calendar'
import type { PublishingAccount, PublishingData } from '@/lib/publishing'
import { ArrowLeft, ChevronDown } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useId, useRef, useState, type ReactNode } from 'react'
import { CalendarMobileHeader } from './calendar-mobile-header'
import { PostComposerPreview } from './post-composer-preview'
import {
  ComposerAccountPicker,
  ComposerFieldError,
  ComposerFooter,
  ComposerMediaSection,
  ComposerScheduling
} from './post-composer-sections'
import { providerOrder } from './post-composer-constants'
import type { PostComposerErrors, PostComposerForm } from './post-composer-types'
import { PostMediaDialog } from './post-media-dialog'
import { PostPlatformOptions } from './post-platform-options'
import { Textarea } from '@/components/ui/textarea'
import styles from './post-composer.module.css'
import theme from './publishing-theme.module.css'

type PostComposerProps = {
  title: string
  form: PostComposerForm
  errors: PostComposerErrors
  accounts: PublishingAccount[]
  clips: CalendarClipOption[]
  publishingClips: PublishingData['clips']
  captionLimit: number
  timeZone: string
  busy: boolean
  saving: boolean
  platformOptions: Partial<Record<ContentPlatform, ReactNode>>
  onFieldChange: <Field extends keyof PostComposerForm>(field: Field, value: PostComposerForm[Field]) => void
  onTimeZoneChange: (value: string) => void
  onToggleAccount: (account: PublishingAccount) => void
  onMediaConfirm: (selection: { clipId: string; media: PublishingMedia[] }) => void
  onUploadingChange: (value: boolean) => void
  onOptionsOpen: () => void
  onOptionsCancel: () => void
  onSave: (status: CalendarMutationStatus) => Promise<void>
  onClose: () => void
  onDelete?: () => void
  onConnectRequest?: () => void
}

/** Derives the preview record and per-platform account labels from the form state. */
function derivePostComposerState(form: PostComposerForm, accounts: PublishingAccount[], clips: CalendarClipOption[]) {
  const selectedAccounts = accounts.filter(account => form.accountIds.includes(account.id))
  const accountNames = Object.fromEntries(providerOrder.map(provider => [
    provider,
    selectedAccounts.filter(account => account.provider === provider)
      .map(account => account.username ? `@${account.username.replace(/^@/, '')}` : account.name)
      .join(', ')
  ])) as Partial<Record<ContentPlatform, string>>
  const selectedClip = clips.find(clip => clip.id === form.clipId)
  const previewPost: ScheduledPostRecord = {
    id: 'composer-preview', title: form.title, caption: form.caption, notes: form.notes,
    platforms: form.platforms, accountIds: form.accountIds,
    status: form.status === 'publish' ? 'publishing' : form.status,
    scheduledAt: new Date().toISOString(), createdAt: '', updatedAt: '',
    clip: selectedClip ?? null, media: form.media, publishingDestinations: []
  }
  return { selectedAccounts, accountNames, selectedClip, previewPost }
}

function OptionsTrigger({ busy, providers, onOpen }: {
  busy: boolean
  providers: ContentPlatform[]
  onOpen: () => void
}) {
  const t = useTranslations('contentCalendar')
  return (
    <Button type="button" variant="ghost" className={styles.optionsTrigger} aria-label={t('composer.platformOptions')} disabled={busy} onClick={onOpen}>
      <span>{t('composer.platformOptions')}</span>
      <span className={styles.optionPlatforms} aria-hidden="true">
        {providers.map(provider => <span key={provider} className={styles.optionPlatform} data-provider={provider}><PublishingPlatformIcon platform={provider} /></span>)}
      </span>
      <ChevronDown className="size-4" />
    </Button>
  )
}

function MoreDetails({ busy, formId, form, errors, onFieldChange }: {
  busy: boolean
  formId: string
  form: PostComposerForm
  errors: PostComposerErrors
  onFieldChange: <Field extends keyof PostComposerForm>(field: Field, value: PostComposerForm[Field]) => void
}) {
  const t = useTranslations('contentCalendar')
  // Desktop shows the optional fields open, as on the reference; phones start collapsed.
  const mobile = useIsMobile()
  return (
    <details className={styles.moreOptions} open={!mobile || errors.title || errors.notes ? true : undefined}>
      <summary>{t('composer.moreOptions')}<ChevronDown className="size-4" /></summary>
      <div className="grid gap-4 pt-4">
        <div className="space-y-2">
          <Label htmlFor={`${formId}-title`}>{t('form.titleLabel')}</Label>
          <Input id={`${formId}-title`} value={form.title} disabled={busy} maxLength={120} onChange={event => onFieldChange('title', event.target.value)} placeholder={t('composer.titleHint')} aria-invalid={Boolean(errors.title)} />
          <ComposerFieldError id={`${formId}-title-error`} message={errors.title} />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${formId}-notes`}>{t('form.notesLabel')}</Label>
          <Textarea id={`${formId}-notes`} value={form.notes} disabled={busy} maxLength={2000} rows={2} onChange={event => onFieldChange('notes', event.target.value)} />
          <ComposerFieldError id={`${formId}-notes-error`} message={errors.notes} />
        </div>
      </div>
    </details>
  )
}

export function PostComposer({
  title, form, errors, accounts, clips, publishingClips, captionLimit, timeZone,
  busy, saving, platformOptions, onFieldChange, onTimeZoneChange, onToggleAccount,
  onMediaConfirm, onUploadingChange, onOptionsOpen, onOptionsCancel, onSave,
  onClose, onDelete, onConnectRequest
}: PostComposerProps) {
  const t = useTranslations('contentCalendar')
  const formId = useId()
  const [mediaOpen, setMediaOpen] = useState(false)
  const [optionsOpen, setOptionsOpen] = useState(false)
  const mediaOpener = useRef<HTMLElement | null>(null)
  const optionsOpener = useRef<HTMLElement | null>(null)
  const { selectedAccounts, accountNames, selectedClip, previewPost } = derivePostComposerState(form, accounts, clips)
  const selectedPlatforms = new Set(form.platforms)
  const primaryLabel = form.status === 'scheduled'
    ? t('composer.schedulePost')
    : form.status === 'publish' ? t('composer.publishNow') : t('composer.saveDraft')

  function restoreFocus(opener: { current: HTMLElement | null }) {
    requestAnimationFrame(() => opener.current?.focus())
  }

  function openMedia() {
    mediaOpener.current = document.activeElement as HTMLElement | null
    setMediaOpen(true)
  }

  function closeMedia() {
    setMediaOpen(false)
    restoreFocus(mediaOpener)
  }

  function openOptions() {
    optionsOpener.current = document.activeElement as HTMLElement | null
    onOptionsOpen()
    setOptionsOpen(true)
  }

  function cancelOptions() {
    onOptionsCancel()
    closeOptions()
  }

  function closeOptions() {
    setOptionsOpen(false)
    restoreFocus(optionsOpener)
  }

  return (
    <div className={`${theme.surface} ${styles.workspace}`} data-publish-surface="" data-post-composer="" data-publishing-workspace="">
      <CalendarMobileHeader />
      <header className={styles.header}>
        <Button type="button" variant="ghost" className={styles.back} onClick={onClose} disabled={busy} aria-label={t('page.back')}><ArrowLeft /><span className={styles.backLabel}>{t('page.back')}</span></Button>
        <h1>{title}</h1>
      </header>
      <form className={styles.form} noValidate onSubmit={event => { event.preventDefault(); void onSave(form.status) }}>
        <div className={styles.primaryGroup}>
          <ComposerAccountPicker
            accounts={accounts}
            selectedAccountIds={form.accountIds}
            busy={busy}
            hasSelection={selectedAccounts.length > 0}
            errors={errors}
            formId={formId}
            onToggleAccount={onToggleAccount}
            onConnectRequest={onConnectRequest}
            onClose={onClose}
          />

          <ComposerMediaSection
            busy={busy}
            formId={formId}
            form={form}
            selectedClip={selectedClip}
            errors={errors}
            onOpen={openMedia}
            onClear={() => onMediaConfirm({ clipId: '', media: [] })}
          />

          <div className={styles.caption}>
            <Label htmlFor={`${formId}-caption`}>{t('composer.postText')}</Label>
            <Textarea
              id={`${formId}-caption`} value={form.caption} disabled={busy} maxLength={captionLimit}
              rows={4} onChange={event => onFieldChange('caption', event.target.value)}
              placeholder={t('form.captionPlaceholder')} aria-invalid={Boolean(errors.caption)}
              aria-describedby={errors.caption ? `${formId}-caption-error` : undefined}
            />
            <span className={styles.characterCount}>{form.caption.length}/{captionLimit}</span>
            <ComposerFieldError id={`${formId}-caption-error`} message={errors.caption} />
          </div>
        </div>

        <PostComposerPreview post={previewPost} accountNames={accountNames} publishingClips={publishingClips} disabled={busy} onChangeMedia={openMedia} />

        <div className={styles.planGroup}>
          <div className={styles.options}>
            <OptionsTrigger busy={busy} providers={providerOrder.filter(provider => selectedPlatforms.has(provider))} onOpen={openOptions} />
            {(['instagram', 'facebook', 'tiktok', 'youtube'] as const).map(provider => (
              <ComposerFieldError key={provider} id={`${formId}-${provider}-error`} message={errors[provider]} />
            ))}
          </div>

          <ComposerScheduling form={form} busy={busy} errors={errors} timeZone={timeZone} formId={formId}
            onFieldChange={onFieldChange} onTimeZoneChange={onTimeZoneChange} />

          <MoreDetails busy={busy} formId={formId} form={form} errors={errors} onFieldChange={onFieldChange} />
        </div>
        {errors.form && <div className={styles.formError} role="alert">{errors.form}</div>}
        <ComposerFooter busy={busy} saving={saving} status={form.status} primaryLabel={primaryLabel}
          onDelete={onDelete} onClose={onClose} onSaveDraft={() => void onSave('draft')} />
      </form>
      {mediaOpen && <PostMediaDialog clips={clips} clipId={form.clipId} media={form.media} disabled={saving} instagramEnabled={form.platforms.includes('instagram')} facebookEnabled={form.platforms.includes('facebook')} tiktokEnabled={form.platforms.includes('tiktok')} onClose={closeMedia} onUploadingChange={onUploadingChange} onConfirm={selection => { onMediaConfirm(selection); closeMedia() }} />}
      {optionsOpen && <PostPlatformOptions platforms={form.platforms} accountNames={accountNames} disabled={busy} onCancel={cancelOptions} onDone={closeOptions}>{platformOptions}</PostPlatformOptions>}
    </div>
  )
}
