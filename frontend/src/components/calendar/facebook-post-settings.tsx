'use client'

import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import type { FacebookPostSettings as Settings } from '@/lib/facebook-post-settings'
import { useTranslations } from 'next-intl'
import { OptionsGroup, OptionsRow } from './post-options-ui'
import { PostSettingsSection } from './post-settings-section'
import styles from './post-platform-options.module.css'

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
      <div className={styles.optionsStack}>
        {isReel && (
          <OptionsGroup label={t('facebookReelTitle')}>
            <div className={styles.titleField}>
              <Input
                id={`${idPrefix}-reel-title`}
                aria-label={t('facebookReelTitle')}
                value={settings.reelTitle}
                disabled={disabled}
                aria-describedby={`${idPrefix}-reel-title-hint`}
                onChange={event => onChange({ ...settings, reelTitle: event.target.value })}
              />
              <span id={`${idPrefix}-reel-title-hint`} className={styles.counter}>
                {settings.reelTitle.length}/255
              </span>
            </div>
          </OptionsGroup>
        )}

        <OptionsGroup label={t('optionsGroupDetails')}>
          <OptionsRow
            htmlFor={`${idPrefix}-place`}
            label={t('facebookPlace')}
            control={
              <Input
                id={`${idPrefix}-place`}
                className={styles.rowInput}
                value={settings.placeId}
                disabled={disabled}
                inputMode="numeric"
                placeholder={t('instagramLocationPlaceholder')}
                aria-describedby={`${idPrefix}-place-hint`}
                onChange={event => onChange({ ...settings, placeId: event.target.value })}
              />
            }
          />
        </OptionsGroup>

        {isReel && (
          <OptionsGroup label={t('optionsGroupDisclosures')}>
            <OptionsRow
              htmlFor={`${idPrefix}-ai`}
              label={t('facebookAiGenerated')}
              control={
                <Switch
                  id={`${idPrefix}-ai`}
                  checked={settings.isAiGenerated}
                  disabled={disabled}
                  onCheckedChange={isAiGenerated => onChange({ ...settings, isAiGenerated })}
                />
              }
            />
          </OptionsGroup>
        )}
      </div>
    </PostSettingsSection>
  )
}
