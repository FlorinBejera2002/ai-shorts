'use client'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import type { InstagramPostSettings } from '@/lib/instagram-post-settings'
import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'
import theme from './publishing-theme.module.css'
import { InstagramCoverPicker } from './instagram-cover-picker'
import { OptionsGroup, OptionsRow } from './post-options-ui'
import { PostSettingsSection } from './post-settings-section'
import styles from './post-platform-options.module.css'

type InstagramChange = <Key extends keyof InstagramPostSettings>(
  key: Key,
  value: InstagramPostSettings[Key]
) => void

interface InstagramFieldProps {
  compact: boolean
  disabled: boolean
  idPrefix: string
  settings: InstagramPostSettings
  onChange: InstagramChange
}

/** Compact fields sit in option rows; section fields keep the labelled stacked layout. */
function FieldShell({
  compact,
  id,
  label,
  hint,
  input
}: {
  compact: boolean
  id: string
  label: string
  hint?: string
  input: ReactNode
}) {
  if (compact) return <OptionsRow htmlFor={id} label={label} control={input} />
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {input}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

function InstagramSwitch({ compact, disabled, id, label, checked, onCheckedChange }: {
  compact: boolean
  disabled: boolean
  id: string
  label: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}) {
  const control = <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} />
  if (compact) return <OptionsRow htmlFor={id} label={label} control={control} />
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <Label htmlFor={id} className="cursor-pointer text-xs text-foreground">{label}</Label>
      {control}
    </div>
  )
}

function CollaboratorsField({ compact, disabled, idPrefix, settings, onChange }: InstagramFieldProps) {
  const t = useTranslations('publishing')
  const id = `${idPrefix}-collaborators`
  return (
    <FieldShell compact={compact} id={id} label={t('instagramCollaborators')}
      hint={compact ? undefined : t('instagramCollaboratorsHint')}
      input={
        <Input id={id} className={compact ? styles.rowInput : undefined} value={settings.collaboratorsText} disabled={disabled}
          placeholder="@username, @username"
          onChange={event => onChange('collaboratorsText', event.target.value)} />
      }
    />
  )
}

function LocationField({ compact, disabled, idPrefix, settings, onChange }: InstagramFieldProps) {
  const t = useTranslations('publishing')
  const id = `${idPrefix}-location`
  return (
    <FieldShell compact={compact} id={id} label={t('instagramLocation')}
      hint={compact ? undefined : t('instagramLocationHint')}
      input={
        <Input id={id} className={compact ? styles.rowInput : undefined} value={settings.locationId} disabled={disabled}
          inputMode="numeric" placeholder={compact ? t('instagramLocationPlaceholder') : undefined}
          onChange={event => onChange('locationId', event.target.value)} />
      }
    />
  )
}

function CoverFrameField({ compact, disabled, idPrefix, settings, onChange }: InstagramFieldProps) {
  const t = useTranslations('publishing')
  const id = `${idPrefix}-cover-time`
  const input = (
    <Input id={id} className={compact ? styles.rowInput : undefined} type="number" min="0" max="900" step="0.1"
      disabled={disabled} value={settings.thumbOffsetSeconds} placeholder="0"
      onChange={event => onChange('thumbOffsetSeconds', event.target.value)} />
  )
  if (!compact) return <FieldShell compact={false} id={id} label={t('instagramCoverTime')} input={input} />
  return <OptionsRow htmlFor={id} label={t('instagramCoverTime')} control={<>{input}<span>s</span></>} />
}

function AudioField({ compact, disabled, idPrefix, settings, onChange }: InstagramFieldProps) {
  const t = useTranslations('publishing')
  const id = `${idPrefix}-audio`
  return (
    <FieldShell compact={compact} id={id} label={t('instagramAudioName')}
      hint={compact ? undefined : t('instagramAudioHint')}
      input={
        <Input id={id} className={compact ? styles.rowInput : undefined} value={settings.audioName} disabled={disabled}
          placeholder={compact ? t('instagramAudioPlaceholder') : undefined}
          onChange={event => onChange('audioName', event.target.value)} />
      }
    />
  )
}

function TrialReelField({ compact, disabled, idPrefix, settings, onChange }: InstagramFieldProps) {
  const t = useTranslations('publishing')
  const id = `${idPrefix}-trial`
  const select = (
    <Select value={settings.trialReel} disabled={disabled} onValueChange={value => onChange('trialReel', value as InstagramPostSettings['trialReel'])}>
      <SelectTrigger id={id} className={compact ? styles.rowSelect : 'w-full'}><SelectValue /></SelectTrigger>
      <SelectContent className={theme.surface} data-publish-surface="">
        <SelectItem value="off">{t('instagramTrialOff')}</SelectItem>
        <SelectItem value="MANUAL">{t('instagramTrialManual')}</SelectItem>
        <SelectItem value="SS_PERFORMANCE">{t('instagramTrialAutomatic')}</SelectItem>
      </SelectContent>
    </Select>
  )
  if (compact) return <OptionsRow htmlFor={id} label={t('instagramTrial')} control={select} />
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{t('instagramTrial')}</Label>
      {select}
      <p className="text-xs text-muted-foreground">{t('instagramTrialHint')}</p>
    </div>
  )
}

function LegacyComments({ disabled, settings, onChange }: { disabled: boolean; settings: InstagramPostSettings; onChange: InstagramChange }) {
  const t = useTranslations('publishing')
  if (settings.commentEnabled) return null
  return (
    <div className="space-y-2 rounded-md border p-3">
      <p className="text-xs">{t('instagramLegacyComments')}</p>
      <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => onChange('commentEnabled', true)}>
        {t('instagramUseAccountSettings')}
      </Button>
    </div>
  )
}

function CompactInstagramSettings({
  disabled, idPrefix, isReel, onChange, onUploadingChange, previewUrl, settings
}: Omit<InstagramSettingsProps, 'presentation'>) {
  const t = useTranslations('publishing')
  const fieldProps = { compact: true, disabled, idPrefix, settings, onChange }
  return (
    <div className={styles.optionsStack}>
      <OptionsGroup label={t('optionsGroupDisplay')}>
        <InstagramSwitch compact disabled={disabled} id={`${idPrefix}-share-to-feed`} label={t('instagramShareToFeed')}
          checked={settings.shareToFeed} onCheckedChange={checked => onChange('shareToFeed', checked)} />
      </OptionsGroup>
      {isReel ? (
        <OptionsGroup label={t('optionsGroupReel')}>
          <CollaboratorsField {...fieldProps} />
          <LocationField {...fieldProps} />
          {!settings.coverReference && <CoverFrameField {...fieldProps} />}
          <AudioField {...fieldProps} />
          <TrialReelField {...fieldProps} />
        </OptionsGroup>
      ) : (
        <OptionsGroup label={t('optionsGroupDetails')}>
          <CollaboratorsField {...fieldProps} />
          <LocationField {...fieldProps} />
        </OptionsGroup>
      )}
      {isReel && (
        <OptionsGroup label={t('optionsGroupCover')}>
          <InstagramCoverPicker id={`${idPrefix}-cover`} reference={settings.coverReference} disabled={disabled}
            presentation="drawer" previewUrl={previewUrl}
            onChange={reference => onChange('coverReference', reference)} onUploadingChange={onUploadingChange} />
        </OptionsGroup>
      )}
      <OptionsGroup label={t('optionsGroupDisclosures')}>
        <InstagramSwitch compact disabled={disabled} id={`${idPrefix}-ai`} label={t('instagramAiGenerated')}
          checked={settings.isAiGenerated} onCheckedChange={checked => onChange('isAiGenerated', checked)} />
      </OptionsGroup>
      <div className={styles.field}>
        <LegacyComments disabled={disabled} settings={settings} onChange={onChange} />
      </div>
    </div>
  )
}

function SectionInstagramSettings({
  disabled, idPrefix, isReel, onChange, onUploadingChange, previewUrl, settings
}: Omit<InstagramSettingsProps, 'presentation'>) {
  const t = useTranslations('publishing')
  const fieldProps = { compact: false, disabled, idPrefix, settings, onChange }
  return (
    <PostSettingsSection idPrefix={idPrefix} provider="instagram" title={t('instagramOptions')} subtitle="Instagram">
      <div className="grid gap-4 sm:grid-cols-2">
        <CollaboratorsField {...fieldProps} />
        <LocationField {...fieldProps} />
      </div>
      <InstagramSwitch compact={false} disabled={disabled} id={`${idPrefix}-ai`} label={t('instagramAiGenerated')}
        checked={settings.isAiGenerated} onCheckedChange={checked => onChange('isAiGenerated', checked)} />
      <p className="text-xs text-muted-foreground">{t('instagramCommentsManaged')}</p>
      <LegacyComments disabled={disabled} settings={settings} onChange={onChange} />
      {isReel && (
        <div className="space-y-4 border-t pt-4">
          <InstagramSwitch compact={false} disabled={disabled} id={`${idPrefix}-share-to-feed`} label={t('instagramShareToFeed')}
            checked={settings.shareToFeed} onCheckedChange={checked => onChange('shareToFeed', checked)} />
          <InstagramCoverPicker id={`${idPrefix}-cover`} reference={settings.coverReference} disabled={disabled}
            presentation="section" previewUrl={previewUrl}
            onChange={reference => onChange('coverReference', reference)} onUploadingChange={onUploadingChange} />
          {!settings.coverReference && <CoverFrameField {...fieldProps} />}
          <AudioField {...fieldProps} />
          <TrialReelField {...fieldProps} />
        </div>
      )}
    </PostSettingsSection>
  )
}

interface InstagramSettingsProps {
  disabled: boolean
  idPrefix: string
  isReel?: boolean
  onChange: InstagramChange
  onUploadingChange: (uploading: boolean) => void
  presentation?: 'section' | 'drawer'
  previewUrl?: string
  settings: InstagramPostSettings
}

export function InstagramPostSettings({ presentation = 'section', isReel = true, ...props }: InstagramSettingsProps) {
  if (presentation === 'drawer') return <CompactInstagramSettings isReel={isReel} {...props} />
  return <SectionInstagramSettings isReel={isReel} {...props} />
}
