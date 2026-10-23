'use client'

import { PlatformBrandIcon } from '@/components/publishing/platform-brand-icon'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LoadingIndicator } from '@/components/ui/loading-indicator'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import type { CalendarClipOption, CalendarMutationStatus, ContentPlatform, PublishingMedia, ScheduledPostRecord } from '@/lib/content-calendar'
import type { PublishingAccount, PublishingData } from '@/lib/publishing'
import { ArrowLeft, Check, ChevronDown, MapPin, Settings2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useId, useRef, useState, type ReactNode } from 'react'
import { CalendarMobileHeader } from './calendar-mobile-header'
import { PostComposerPreview } from './post-composer-preview'
import type { PostComposerErrors, PostComposerForm } from './post-composer-types'
import { PostMediaDialog } from './post-media-dialog'
import { PostPlatformOptions } from './post-platform-options'
import { SchedulePicker } from './schedule-picker'
import styles from './post-composer.module.css'

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
}

const providerOrder: ContentPlatform[] = ['instagram', 'tiktok', 'facebook', 'youtube']
const modes: CalendarMutationStatus[] = ['draft', 'scheduled', 'publish']
const commonZones = ['Europe/Bucharest', 'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'America/New_York', 'America/Los_Angeles', 'Asia/Dubai', 'Asia/Tokyo', 'UTC']

export function PostComposer({
  title, form, errors, accounts, clips, publishingClips, captionLimit, timeZone,
  busy, saving, platformOptions, onFieldChange, onTimeZoneChange, onToggleAccount,
  onMediaConfirm, onUploadingChange, onOptionsOpen, onOptionsCancel, onSave,
  onClose, onDelete
}: PostComposerProps) {
  const t = useTranslations('contentCalendar')
  const formId = useId()
  const [mediaOpen, setMediaOpen] = useState(false)
  const [optionsOpen, setOptionsOpen] = useState(false)
  const mediaOpener = useRef<HTMLElement | null>(null)
  const optionsOpener = useRef<HTMLElement | null>(null)
  const selectedAccounts = accounts.filter(account => form.accountIds.includes(account.id))
  const accountNames = Object.fromEntries(providerOrder.map(provider => [
    provider,
    selectedAccounts.filter(account => account.provider === provider)
      .map(account => account.username ? `@${account.username.replace(/^@/, '')}` : account.name)
      .join(', ')
  ]))
  const selectedClip = clips.find(clip => clip.id === form.clipId)
  const previewPost: ScheduledPostRecord = {
    id: 'composer-preview', title: form.title, caption: form.caption, notes: form.notes,
    platforms: form.platforms, accountIds: form.accountIds,
    status: form.status === 'publish' ? 'publishing' : form.status,
    scheduledAt: new Date().toISOString(), createdAt: '', updatedAt: '',
    clip: selectedClip ?? null, media: form.media, publishingDestinations: []
  }
  const primaryLabel = form.status === 'scheduled'
    ? t('composer.schedulePost')
    : form.status === 'publish' ? t('composer.publishNow') : t('composer.saveDraft')
  const showError = (field: keyof PostComposerErrors) => errors[field] && (
    <p id={`${formId}-${field}-error`} role="alert" className={styles.fieldError}>{errors[field]}</p>
  )

  function cancelOptions() {
    onOptionsCancel()
    closeOptions()
  }

  function openMedia() {
    mediaOpener.current = document.activeElement as HTMLElement | null
    setMediaOpen(true)
  }

  function closeMedia() {
    setMediaOpen(false)
    requestAnimationFrame(() => mediaOpener.current?.focus())
  }

  function closeOptions() {
    setOptionsOpen(false)
    requestAnimationFrame(() => optionsOpener.current?.focus())
  }

  return (
    <div className={styles.workspace} data-post-composer="" data-publishing-workspace="">
      <CalendarMobileHeader />
      <header className={styles.header}>
        <Button type="button" variant="ghost" size="icon" onClick={onClose} disabled={busy} aria-label={t('page.back')}><ArrowLeft /></Button>
        <h1>{title}</h1>
      </header>
      <form className={styles.form} noValidate onSubmit={event => { event.preventDefault(); void onSave(form.status) }}>
        <fieldset className={styles.accounts} disabled={busy} aria-describedby={errors.platforms ? `${formId}-platforms-error` : undefined}>
          <legend>{t('composer.publishTo')}</legend>
          <div className={styles.accountTiles}>
            {providerOrder.flatMap(provider => {
              const available = accounts.filter(account => account.provider === provider)
              return (available.length ? available : [null]).map(account => {
                const selected = Boolean(account && form.accountIds.includes(account.id))
                return (
                  <button
                    key={account?.id ?? provider}
                    type="button"
                    disabled={busy || !account}
                    data-composer-account={account?.id}
                    aria-label={t('composer.selectAccount', { platform: t(`platforms.${provider}`), account: account?.username || account?.name || t('composer.notConnected') })}
                    aria-pressed={selected}
                    onClick={() => account && onToggleAccount(account)}
                    className={styles.accountTile}
                    title={account?.username || account?.name || t('composer.notConnected')}
                  >
                    <PlatformBrandIcon provider={provider} className="size-9" />
                    {selected && <span className={styles.selectedBadge}><Check className="size-3" /></span>}
                  </button>
                )
              })
            })}
          </div>
          <p className={styles.accountNames}>{selectedAccounts.length ? [...new Set(Object.values(accountNames).filter(Boolean))].join(' · ') : t('composer.chooseAccounts')}</p>
          {accounts.length === 0 && <Button type="button" variant="link" onClick={onClose}>{t('form.closeAndConnect')}</Button>}
          {showError('platforms')}{showError('accountIds')}
        </fieldset>

        <PostComposerPreview post={previewPost} publishingClips={publishingClips} disabled={busy} onChangeMedia={openMedia} />

        <div className={styles.caption}>
          <Label htmlFor={`${formId}-caption`}>{t('composer.postText')}</Label>
          <Textarea
            id={`${formId}-caption`} value={form.caption} disabled={busy} maxLength={captionLimit}
            rows={5} onChange={event => onFieldChange('caption', event.target.value)}
            placeholder={t('form.captionPlaceholder')} aria-invalid={Boolean(errors.caption)}
            aria-describedby={errors.caption ? `${formId}-caption-error` : undefined}
          />
          <span className={styles.characterCount}>{form.caption.length}/{captionLimit}</span>
          {showError('caption')}
        </div>

        <div className={styles.options}>
          <Button type="button" variant="outline" className={styles.optionsTrigger} disabled={busy} onClick={() => { optionsOpener.current = document.activeElement as HTMLElement | null; onOptionsOpen(); setOptionsOpen(true) }}>
            <Settings2 className="size-5" /><span>{t('composer.platformOptions')}</span><ChevronDown className="ml-auto size-4" />
          </Button>
          {showError('instagram')}{showError('facebook')}{showError('tiktok')}{showError('youtube')}
          {showError('media')}{showError('clipId')}
        </div>

        <div className={styles.scheduling}>
          <Tabs value={form.status} onValueChange={value => onFieldChange('status', value as CalendarMutationStatus)} className="gap-0">
            <TabsList className={styles.modeTabs} aria-label={t('form.statusLabel')}>
              {modes.map(mode => <TabsTrigger key={mode} value={mode} disabled={busy} className={styles.modeTab}>{t(`composer.modes.${mode}`)}</TabsTrigger>)}
            </TabsList>
          </Tabs>
          {form.status === 'scheduled' && (
            <div className={styles.scheduleControls}>
              <div className={styles.schedulePicker}>
                <SchedulePicker compact date={form.date} time={form.time} onDateChange={value => onFieldChange('date', value)} onTimeChange={value => onFieldChange('time', value)} dateError={errors.date} timeError={errors.time} />
              </div>
              <Select value={timeZone} onValueChange={onTimeZoneChange} disabled={busy}>
                <SelectTrigger aria-label={t('composer.timeZone')} className={styles.zoneTrigger}><MapPin className="size-4 shrink-0" /><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[...new Set([timeZone, ...commonZones])].map(zone => <SelectItem key={zone} value={zone}>{zone}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          {showError('status')}
        </div>

        <details className={styles.moreOptions} open={errors.title || errors.notes ? true : undefined}>
          <summary>{t('composer.moreOptions')}<ChevronDown className="size-4" /></summary>
          <div className="grid gap-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor={`${formId}-title`}>{t('form.titleLabel')}</Label>
              <Input id={`${formId}-title`} value={form.title} disabled={busy} maxLength={120} onChange={event => onFieldChange('title', event.target.value)} placeholder={t('composer.titleHint')} aria-invalid={Boolean(errors.title)} />
              {showError('title')}
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${formId}-notes`}>{t('form.notesLabel')}</Label>
              <Textarea id={`${formId}-notes`} value={form.notes} disabled={busy} maxLength={2000} rows={2} onChange={event => onFieldChange('notes', event.target.value)} />
              {showError('notes')}
            </div>
          </div>
        </details>
        {errors.form && <div className={styles.formError} role="alert">{errors.form}</div>}
        <footer className={styles.footer}>
          {onDelete && <Button type="button" variant="ghost" className={styles.delete} disabled={busy} onClick={onDelete}>{t('actions.delete')}</Button>}
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy} className={styles.cancel}>{t('actions.cancel')}</Button>
          {form.status !== 'draft' && <Button type="button" variant="outline" onClick={() => void onSave('draft')} disabled={busy}>{t('composer.saveDraft')}</Button>}
          <Button type="submit" disabled={busy} className={styles.primary}>{saving && <LoadingIndicator className="size-4" />}{saving ? t('actions.saving') : primaryLabel}</Button>
        </footer>
      </form>
      {mediaOpen && <PostMediaDialog clips={clips} clipId={form.clipId} media={form.media} disabled={saving} instagramEnabled={form.platforms.includes('instagram')} facebookEnabled={form.platforms.includes('facebook')} tiktokEnabled={form.platforms.includes('tiktok')} onClose={closeMedia} onUploadingChange={onUploadingChange} onConfirm={selection => { onMediaConfirm(selection); closeMedia() }} />}
      {optionsOpen && <PostPlatformOptions platforms={form.platforms} accountNames={accountNames} disabled={busy} onCancel={cancelOptions} onDone={closeOptions}>{platformOptions}</PostPlatformOptions>}
    </div>
  )
}
