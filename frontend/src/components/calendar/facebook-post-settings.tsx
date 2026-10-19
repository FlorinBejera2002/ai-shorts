import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import type { FacebookPostSettings as Settings } from '@/lib/facebook-post-settings'
import { useTranslations } from 'next-intl'
import { PostSettingsSection } from './post-settings-section'

export function FacebookPostSettings({
  disabled,
  idPrefix,
  isReel,
  settings,
  onChange
}: {
  disabled: boolean
  idPrefix: string
  isReel: boolean
  settings: Settings
  onChange: (settings: Settings) => void
}) {
  const t = useTranslations('publishing')

  return (
    <PostSettingsSection
      idPrefix={idPrefix}
      provider="facebook"
      title={t('facebookOptions')}
      subtitle={t('facebookPages')}
    >
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-place`}>{t('facebookPlace')}</Label>
        <Input
          id={`${idPrefix}-place`}
          value={settings.placeId}
          disabled={disabled}
          inputMode="numeric"
          aria-describedby={`${idPrefix}-place-hint`}
          onChange={event => onChange({ ...settings, placeId: event.target.value })}
        />
        <p id={`${idPrefix}-place-hint`} className="text-xs text-muted-foreground">
          {t('facebookPlaceHint')}
        </p>
      </div>
      {isReel && (
        <>
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-reel-title`}>{t('facebookReelTitle')}</Label>
            <Input
              id={`${idPrefix}-reel-title`}
              value={settings.reelTitle}
              disabled={disabled}
              aria-describedby={`${idPrefix}-reel-title-hint`}
              onChange={event => onChange({ ...settings, reelTitle: event.target.value })}
            />
            <p id={`${idPrefix}-reel-title-hint`} className="text-xs text-muted-foreground">
              {t('facebookReelTitleHint')}
            </p>
          </div>
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor={`${idPrefix}-ai`} className="cursor-pointer text-xs">
              {t('facebookAiGenerated')}
            </Label>
            <Switch
              id={`${idPrefix}-ai`}
              checked={settings.isAiGenerated}
              disabled={disabled}
              onCheckedChange={isAiGenerated => onChange({ ...settings, isAiGenerated })}
            />
          </div>
        </>
      )}
    </PostSettingsSection>
  )
}
