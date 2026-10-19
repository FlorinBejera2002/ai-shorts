'use client'

import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import type { InstagramPostSettings } from '@/lib/instagram-post-settings'
import { useTranslations } from 'next-intl'
import { InstagramCoverPicker } from './instagram-cover-picker'
import { PostSettingsSection } from './post-settings-section'

function SettingRow({
  checked,
  disabled,
  id,
  label,
  onCheckedChange
}: {
  checked: boolean
  disabled?: boolean
  id: string
  label: string
  onCheckedChange: (checked: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
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
}) {
  const t = useTranslations('publishing')

  return (
    <PostSettingsSection
      idPrefix={idPrefix}
      provider="instagram"
      title={t('instagramOptions')}
      subtitle="Instagram"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-collaborators`}>{t('instagramCollaborators')}</Label>
          <Input id={`${idPrefix}-collaborators`} value={settings.collaboratorsText} disabled={disabled}
            placeholder="@username, @username" aria-describedby={`${idPrefix}-collaborators-hint`}
            onChange={event => onChange('collaboratorsText', event.target.value)} />
          <p id={`${idPrefix}-collaborators-hint`} className="text-xs text-muted-foreground">{t('instagramCollaboratorsHint')}</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-location`}>{t('instagramLocation')}</Label>
          <Input id={`${idPrefix}-location`} value={settings.locationId} disabled={disabled} inputMode="numeric"
            aria-describedby={`${idPrefix}-location-hint`} onChange={event => onChange('locationId', event.target.value)} />
          <p id={`${idPrefix}-location-hint`} className="text-xs text-muted-foreground">{t('instagramLocationHint')}</p>
        </div>
      </div>
      <SettingRow id={`${idPrefix}-ai`} label={t('instagramAiGenerated')} checked={settings.isAiGenerated}
        disabled={disabled} onCheckedChange={checked => onChange('isAiGenerated', checked)} />
      <p className="text-xs text-muted-foreground">{t('instagramCommentsManaged')}</p>
      {!settings.commentEnabled && (
        <div className="space-y-2 rounded-md border p-3">
          <p className="text-xs">{t('instagramLegacyComments')}</p>
          <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => onChange('commentEnabled', true)}>
            {t('instagramUseAccountSettings')}
          </Button>
        </div>
      )}
      {isReel && <div className="space-y-4 border-t pt-4">
        <SettingRow
          id={`${idPrefix}-share-to-feed`}
          label={t('instagramShareToFeed')}
          checked={settings.shareToFeed}
          disabled={disabled}
          onCheckedChange={(checked) =>
            onChange('shareToFeed', checked)
          }
        />
        <InstagramCoverPicker id={`${idPrefix}-cover`} reference={settings.coverReference} disabled={disabled}
          onChange={reference => onChange('coverReference', reference)} onUploadingChange={onUploadingChange} />
        {!settings.coverReference && <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-cover-time`}>{t('instagramCoverTime')}</Label>
          <Input id={`${idPrefix}-cover-time`} type="number" min="0" max="900" step="0.1" disabled={disabled}
            value={settings.thumbOffsetSeconds} placeholder="0" onChange={event => onChange('thumbOffsetSeconds', event.target.value)} />
        </div>}
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-audio`}>{t('instagramAudioName')}</Label>
          <Input id={`${idPrefix}-audio`} value={settings.audioName} disabled={disabled}
            onChange={event => onChange('audioName', event.target.value)} />
          <p className="text-xs text-muted-foreground">{t('instagramAudioHint')}</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-trial`}>{t('instagramTrial')}</Label>
          <Select value={settings.trialReel} disabled={disabled} onValueChange={value => onChange('trialReel', value as InstagramPostSettings['trialReel'])}>
            <SelectTrigger id={`${idPrefix}-trial`} className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="off">{t('instagramTrialOff')}</SelectItem>
              <SelectItem value="MANUAL">{t('instagramTrialManual')}</SelectItem>
              <SelectItem value="SS_PERFORMANCE">{t('instagramTrialAutomatic')}</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">{t('instagramTrialHint')}</p>
        </div>
      </div>}
    </PostSettingsSection>
  )
}
