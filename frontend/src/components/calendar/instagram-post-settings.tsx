'use client'

import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import type { InstagramPostSettings } from '@/lib/instagram-post-settings'
import { ChevronDown } from 'lucide-react'
import { useTranslations } from 'next-intl'
import theme from './publishing-theme.module.css'
import { InstagramCoverPicker } from './instagram-cover-picker'
import { PostSettingsSection } from './post-settings-section'
import styles from './post-platform-options.module.css'

function SettingRow({
  checked,
  disabled,
  id,
  label,
  onCheckedChange,
  compact = false
}: {
  checked: boolean
  disabled?: boolean
  id: string
  label: string
  onCheckedChange: (checked: boolean) => void
  compact?: boolean
}) {
  return (
    <div className={compact ? styles.settingRow : 'flex items-center justify-between gap-3 py-1'}>
      <Label htmlFor={id} className="cursor-pointer text-xs text-foreground">
        {label}
      </Label>
      <Switch
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
      />
    </div>
  )
}

export function InstagramPostSettings({
  disabled,
  idPrefix,
  isReel = true,
  onChange,
  onUploadingChange,
  presentation = 'section',
  previewUrl,
  settings
}: {
  disabled: boolean
  idPrefix: string
  isReel?: boolean
  onUploadingChange: (uploading: boolean) => void
  onChange: <Key extends keyof InstagramPostSettings>(
    key: Key,
    value: InstagramPostSettings[Key]
  ) => void
  settings: InstagramPostSettings
  presentation?: 'section' | 'drawer'
  previewUrl?: string
}) {
  const t = useTranslations('publishing')
  const composerT = useTranslations('contentCalendar.composer')
  const compact = presentation === 'drawer'
  const fieldClass = compact ? styles.field : 'space-y-2'
  const hintClass = compact ? styles.fieldHint : 'text-xs text-muted-foreground'

  const collaborators = (
    <div className={fieldClass}>
      <Label htmlFor={`${idPrefix}-collaborators`}>{t('instagramCollaborators')}</Label>
      <Input id={`${idPrefix}-collaborators`} value={settings.collaboratorsText} disabled={disabled}
        placeholder="@username, @username" aria-describedby={`${idPrefix}-collaborators-hint`}
        onChange={event => onChange('collaboratorsText', event.target.value)} />
      <p id={`${idPrefix}-collaborators-hint`} className={hintClass}>{t('instagramCollaboratorsHint')}</p>
    </div>
  )
  const location = (
    <div className={fieldClass}>
      <Label htmlFor={`${idPrefix}-location`}>{t('instagramLocation')}</Label>
      <Input id={`${idPrefix}-location`} value={settings.locationId} disabled={disabled} inputMode="numeric"
        aria-describedby={`${idPrefix}-location-hint`} onChange={event => onChange('locationId', event.target.value)} />
      <p id={`${idPrefix}-location-hint`} className={hintClass}>{t('instagramLocationHint')}</p>
    </div>
  )
  const aiGenerated = (
    <SettingRow id={`${idPrefix}-ai`} label={t('instagramAiGenerated')} checked={settings.isAiGenerated}
      compact={compact} disabled={disabled} onCheckedChange={checked => onChange('isAiGenerated', checked)} />
  )
  const comments = (
    <div className="space-y-3">
      <p className={hintClass}>{t('instagramCommentsManaged')}</p>
      {!settings.commentEnabled && (
        <div className="space-y-2 rounded-md border p-3">
          <p className="text-xs">{t('instagramLegacyComments')}</p>
          <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => onChange('commentEnabled', true)}>
            {t('instagramUseAccountSettings')}
          </Button>
        </div>
      )}
    </div>
  )
  const shareToFeed = (
    <SettingRow
      id={`${idPrefix}-share-to-feed`}
      label={t('instagramShareToFeed')}
      checked={settings.shareToFeed}
      compact={compact}
      disabled={disabled}
      onCheckedChange={checked => onChange('shareToFeed', checked)}
    />
  )
  const cover = (
    <InstagramCoverPicker id={`${idPrefix}-cover`} reference={settings.coverReference} disabled={disabled}
      presentation={presentation} previewUrl={previewUrl}
      onChange={reference => onChange('coverReference', reference)} onUploadingChange={onUploadingChange} />
  )
  const coverFrame = !settings.coverReference && (
    <div className="space-y-2">
      <Label htmlFor={`${idPrefix}-cover-time`}>{t('instagramCoverTime')}</Label>
      <Input id={`${idPrefix}-cover-time`} type="number" min="0" max="900" step="0.1" disabled={disabled}
        value={settings.thumbOffsetSeconds} placeholder="0" onChange={event => onChange('thumbOffsetSeconds', event.target.value)} />
    </div>
  )
  const audio = (
    <div className={fieldClass}>
      <Label htmlFor={`${idPrefix}-audio`}>{t('instagramAudioName')}</Label>
      <Input id={`${idPrefix}-audio`} value={settings.audioName} disabled={disabled}
        onChange={event => onChange('audioName', event.target.value)} />
      <p className={hintClass}>{t('instagramAudioHint')}</p>
    </div>
  )
  const trial = (
    <div className="space-y-2">
      <Label htmlFor={`${idPrefix}-trial`}>{t('instagramTrial')}</Label>
      <Select value={settings.trialReel} disabled={disabled} onValueChange={value => onChange('trialReel', value as InstagramPostSettings['trialReel'])}>
        <SelectTrigger id={`${idPrefix}-trial`} className="w-full"><SelectValue /></SelectTrigger>
        <SelectContent className={theme.surface} data-publish-surface="">
          <SelectItem value="off">{t('instagramTrialOff')}</SelectItem>
          <SelectItem value="MANUAL">{t('instagramTrialManual')}</SelectItem>
          <SelectItem value="SS_PERFORMANCE">{t('instagramTrialAutomatic')}</SelectItem>
        </SelectContent>
      </Select>
      <p className={hintClass}>{t('instagramTrialHint')}</p>
    </div>
  )

  if (compact) {
    return (
      <div className={styles.instagramSettings}>
        {isReel && cover}
        {collaborators}
        {location}
        {isReel && audio}
        {isReel && <div className={styles.field}>{trial}</div>}
        {isReel && shareToFeed}
        {aiGenerated}
        <div className={styles.field}>{comments}</div>
        <details className={styles.more}>
          <summary>{composerT('moreOptions')}<ChevronDown className="size-4" aria-hidden="true" /></summary>
          <div className={styles.advanced}>
            {isReel && coverFrame}
          </div>
        </details>
      </div>
    )
  }

  return (
    <PostSettingsSection
      idPrefix={idPrefix}
      provider="instagram"
      title={t('instagramOptions')}
      subtitle="Instagram"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {collaborators}
        {location}
      </div>
      {aiGenerated}
      {comments}
      {isReel && <div className="space-y-4 border-t pt-4">
        {shareToFeed}
        {cover}
        {coverFrame}
        {audio}
        {trial}
      </div>}
    </PostSettingsSection>
  )
}
