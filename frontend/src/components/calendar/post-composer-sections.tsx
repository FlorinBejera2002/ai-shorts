'use client'

import { PublishingPlatformIcon } from '@/components/publishing/publishing-platform-icon'
import { Button } from '@/components/ui/button'
import { LoadingIndicator } from '@/components/ui/loading-indicator'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { CalendarClipOption, CalendarMutationStatus, ContentPlatform } from '@/lib/content-calendar'
import { commonZones, modes, providerOrder } from './post-composer-constants'
import type { PublishingAccount } from '@/lib/publishing'
import { Check, Film, MapPin, Plus, X } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { formatDuration } from '@/lib/utils'
import { parseLocalDateKey } from './calendar-utils'
import type { PostComposerErrors, PostComposerForm } from './post-composer-types'
import { SchedulePicker } from './schedule-picker'
import styles from './post-composer.module.css'
import theme from './publishing-theme.module.css'

export function ComposerFieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null
  return <p id={id} role="alert" className={styles.fieldError}>{message}</p>
}

function accountLabel(account: PublishingAccount | null, notConnected: string) {
  return account?.username ? `@${account.username.replace(/^@/, '')}` : account?.name || notConnected
}

interface AccountTileProps {
  account: PublishingAccount | null
  provider: ContentPlatform
  selected: boolean
  busy: boolean
  onToggleAccount: (account: PublishingAccount) => void
  onConnectRequest?: () => void
}

function AccountTile({ account, provider, selected, busy, onToggleAccount, onConnectRequest }: AccountTileProps) {
  const t = useTranslations('contentCalendar')
  const notConnected = t('composer.notConnected')
  const label = accountLabel(account, notConnected)
  return (
    <button
      type="button"
      disabled={busy || (!account && !onConnectRequest)}
      data-composer-account={account?.id}
      data-provider={provider}
      data-connected={Boolean(account)}
      aria-label={t('composer.selectAccount', { platform: t(`platforms.${provider}`), account: account?.username || account?.name || notConnected })}
      aria-pressed={selected}
      onClick={() => account ? onToggleAccount(account) : onConnectRequest?.()}
      className={styles.accountTile}
      title={label}
    >
      <span className={styles.accountCircle}>
        <PublishingPlatformIcon platform={provider} />
        {selected && <span className={styles.selectedBadge}><Check className="size-3" /></span>}
        {!account && <span className={styles.connectBadge}><Plus className="size-3" /></span>}
      </span>
      <span className={styles.accountLabel}>{account ? label : t(`platforms.${provider}`)}</span>
    </button>
  )
}

export function ComposerAccountPicker({
  accounts, selectedAccountIds, busy, hasSelection, errors, formId, onToggleAccount, onConnectRequest, onClose
}: {
  accounts: PublishingAccount[]
  selectedAccountIds: string[]
  busy: boolean
  hasSelection: boolean
  errors: PostComposerErrors
  formId: string
  onToggleAccount: (account: PublishingAccount) => void
  onConnectRequest?: () => void
  onClose: () => void
}) {
  const t = useTranslations('contentCalendar')
  const selectedIds = new Set(selectedAccountIds)
  return (
    <fieldset className={styles.accounts} disabled={busy} aria-describedby={errors.platforms ? `${formId}-platforms-error` : undefined}>
      <legend>{t('composer.publishTo')}</legend>
      <div className={styles.accountTiles}>
        {providerOrder.flatMap(provider => {
          const available = accounts.filter(account => account.provider === provider)
          return (available.length ? available : [null]).map(account => (
            <AccountTile
              key={account?.id ?? provider}
              account={account}
              provider={provider}
              selected={Boolean(account && selectedIds.has(account.id))}
              busy={busy}
              onToggleAccount={onToggleAccount}
              onConnectRequest={onConnectRequest}
            />
          ))
        })}
      </div>
      {!hasSelection && <p className={styles.accountNames}>{t('composer.chooseAccounts')}</p>}
      {accounts.length === 0 && <Button type="button" variant="link" onClick={onConnectRequest ?? onClose}>{t('form.closeAndConnect')}</Button>}
      <ComposerFieldError id={`${formId}-platforms-error`} message={errors.platforms} />
      <ComposerFieldError id={`${formId}-accountIds-error`} message={errors.accountIds} />
    </fieldset>
  )
}

/** Media summary: a header with the count and "Add", then the chosen clip or device files as one row. */
export function ComposerMediaSection({
  busy, formId, form, selectedClip, errors, onOpen, onClear
}: {
  busy: boolean
  formId: string
  form: PostComposerForm
  selectedClip?: CalendarClipOption
  errors: PostComposerErrors
  onOpen: () => void
  onClear: () => void
}) {
  const t = useTranslations('contentCalendar')
  const hasMedia = Boolean(selectedClip || form.media.length)
  const title = selectedClip?.title || form.media[0]?.name || t('composer.chooseMedia')
  const countLabel = selectedClip
    ? t('composer.clipCount', { count: 1 })
    : form.media.length ? t('composer.mediaCount', { count: form.media.length }) : null
  return (
    <section className={styles.media} aria-labelledby={`${formId}-media`}>
      <div className={styles.mediaHeader}>
        <h2 id={`${formId}-media`}>{t('form.mediaSectionTitle')}</h2>
        <span className={styles.mediaHeaderActions}>
          {countLabel && <span className={styles.mediaCount}>{countLabel}</span>}
          <Button type="button" variant="ghost" className={styles.addMedia} onClick={onOpen} disabled={busy}>
            <Plus className="size-4" aria-hidden="true" />
            {t('composer.addMedia')}
          </Button>
        </span>
      </div>
      <div className={styles.mediaRow}>
        <button type="button" className={styles.mediaSummary} onClick={onOpen} disabled={busy} aria-label={t('composer.changeMedia')}>
          <span className={styles.mediaThumbnail}>
            {selectedClip?.thumbnailUrl
              ? <img src={selectedClip.thumbnailUrl} alt="" />
              : <Film className="size-5" aria-hidden="true" />}
            {selectedClip && <span className={styles.mediaPlay} aria-hidden="true" />}
          </span>
          <span className={styles.mediaMetadata}>
            <strong>{title}</strong>
            {hasMedia && (
              <span className={styles.mediaChips}>
                {selectedClip && <span className={styles.mediaChip}>{formatDuration(selectedClip.duration)}</span>}
                {!selectedClip && form.media.length > 1 && <span className={styles.mediaChip}>{t('composer.mediaCount', { count: form.media.length })}</span>}
              </span>
            )}
          </span>
        </button>
        {hasMedia && (
          <Button type="button" variant="ghost" size="icon" className={styles.removeMedia} onClick={onClear} disabled={busy} aria-label={t('form.removeMedia', { name: title })}>
            <X className="size-4" />
          </Button>
        )}
      </div>
      <ComposerFieldError id={`${formId}-media-error`} message={errors.media} />
      <ComposerFieldError id={`${formId}-clipId-error`} message={errors.clipId} />
    </section>
  )
}

/** Local calendar date as the canvas phrases it, for example "joi, 22 oct.". */
function formatScheduleDay(value: string, locale: string) {
  const date = parseLocalDateKey(value)
  if (!date) return value
  return new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short' }).format(date)
}

export function ComposerScheduling({
  form, busy, errors, timeZone, formId, onFieldChange, onTimeZoneChange
}: {
  form: PostComposerForm
  busy: boolean
  errors: PostComposerErrors
  timeZone: string
  formId: string
  onFieldChange: <Field extends keyof PostComposerForm>(field: Field, value: PostComposerForm[Field]) => void
  onTimeZoneChange: (value: string) => void
}) {
  const t = useTranslations('contentCalendar')
  const locale = useLocale()
  const scheduled = form.status === 'scheduled'
  const selectedPlatforms = new Set(form.platforms)
  const platforms = providerOrder
    .filter(provider => selectedPlatforms.has(provider))
    .map(provider => t(`platforms.${provider}`))
    .join(', ')
  return (
    <div className={styles.scheduling}>
      <h2>{t('composer.when')}</h2>
      <Tabs value={form.status} onValueChange={value => onFieldChange('status', value as CalendarMutationStatus)} className="gap-0">
        <TabsList className={styles.modeTabs} aria-label={t('form.statusLabel')}>
          {modes.map(mode => <TabsTrigger key={mode} value={mode} disabled={busy} className={styles.modeTab}>{t(`composer.modes.${mode}`)}</TabsTrigger>)}
        </TabsList>
      </Tabs>
      {scheduled && (
        <>
          <div className={styles.scheduleControls}>
            <SchedulePicker compact disabled={busy} date={form.date} time={form.time}
              visibleLabels={{ date: t('composer.dateField'), time: t('composer.timeField') }}
              onDateChange={value => onFieldChange('date', value)} onTimeChange={value => onFieldChange('time', value)}
              dateError={errors.date} timeError={errors.time} />
            <div className={styles.zoneField}>
              <span className={styles.label} aria-hidden="true">{t('composer.timeZoneField')}</span>
              <Select value={timeZone} onValueChange={onTimeZoneChange} disabled={busy}>
                <SelectTrigger aria-label={t('composer.timeZone')} className={styles.zoneTrigger}><MapPin className="size-4 shrink-0" /><SelectValue /></SelectTrigger>
                <SelectContent className={`${theme.surface} ${styles.zonePopup}`} data-publish-surface="">
                  {[...new Set([timeZone, ...commonZones])].map(zone => <SelectItem key={zone} value={zone}>{zone}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          {form.date && platforms && (
            <p className={styles.scheduleSummary}>
              {t('composer.scheduleSummary', { date: formatScheduleDay(form.date, locale), time: form.time, zone: timeZone, platforms })}
            </p>
          )}
        </>
      )}
      <ComposerFieldError id={`${formId}-status-error`} message={errors.status} />
    </div>
  )
}

export function ComposerFooter({
  busy, saving, status, primaryLabel, onDelete, onClose, onSaveDraft
}: {
  busy: boolean
  saving: boolean
  status: CalendarMutationStatus
  primaryLabel: string
  onDelete?: () => void
  onClose: () => void
  onSaveDraft: () => void
}) {
  const t = useTranslations('contentCalendar')
  return (
    <footer className={styles.footer}>
      {onDelete && <Button type="button" variant="ghost" className={styles.delete} disabled={busy} onClick={onDelete}>{t('actions.delete')}</Button>}
      <Button type="button" variant="ghost" onClick={onClose} disabled={busy} className={styles.cancel}>{t('actions.cancel')}</Button>
      {status !== 'draft' && <Button type="button" variant="outline" className={styles.saveDraft} onClick={onSaveDraft} disabled={busy}>{t('composer.saveDraft')}</Button>}
      <Button type="submit" disabled={busy} className={styles.primary}>{saving && <LoadingIndicator className="size-4" />}{saving ? t('actions.saving') : primaryLabel}</Button>
    </footer>
  )
}
