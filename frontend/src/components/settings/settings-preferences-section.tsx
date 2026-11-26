'use client'

import ui from '@/components/shared/reference-ui.module.css'
import type { AccountPreferences } from '@/lib/settings'
import { Globe, Globe2, Minus, Moon, Plus, RectangleVertical, Rows3 } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { SettingsChoice, type ChoiceOption } from './settings-choice'
import { SettingsLoadState } from './settings-load-state'
import { IconCircle, Segmented, SettingsCard } from './settings-ui'
import type { SettingsPanelsController } from './use-settings-panels'
import styles from './settings.module.css'
import controls from './settings-controls.module.css'

type Props = { panels: SettingsPanelsController; mobile: boolean }

const LANGUAGES: ChoiceOption[] = [
  { value: 'ro', label: 'Română' },
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Español' }
]

// The backend and clip jobs accept these formats; the canvas' 4:5 has no backing support yet.
const RATIOS: { value: AccountPreferences['defaultAspectRatio']; width: number; height: number }[] = [
  { value: '9:16', width: 9, height: 14 },
  { value: '1:1', width: 12, height: 12 },
  { value: '16:9', width: 15, height: 9 }
]

function timezoneOption(zone: string, locale: string): ChoiceOption {
  const offset = new Intl.DateTimeFormat(locale, { timeZone: zone, timeZoneName: 'shortOffset' })
    .formatToParts(new Date())
    .find((part) => part.type === 'timeZoneName')?.value
  return { value: zone, label: offset ? `${zone} (${offset})` : zone, short: zone }
}

function timezoneOptions(current: string, locale: string) {
  const zones = new Set(Intl.supportedValuesOf('timeZone'))
  zones.add(current)
  zones.add('UTC')
  return [...zones].sort().map((zone) => timezoneOption(zone, locale))
}

function Stepper({ value, disabled, onChange }: { value: number; disabled: boolean; onChange: (value: number) => void }) {
  const t = useTranslations('settings.page')
  return (
    <span className={controls.stepper}>
      <button
        type="button"
        className={`${ui.iconButton} ${ui.focus}`}
        aria-label={t('fewer')}
        disabled={disabled || value <= 1}
        onClick={() => onChange(value - 1)}
        data-settings-clip-count="decrease"
      >
        <Minus aria-hidden="true" />
      </button>
      <b aria-live="polite" data-settings-clip-count-value="">
        {value}
      </b>
      <button
        type="button"
        className={`${ui.iconButton} ${ui.focus}`}
        aria-label={t('more')}
        disabled={disabled || value >= 10}
        onClick={() => onChange(value + 1)}
        data-settings-clip-count="increase"
      >
        <Plus aria-hidden="true" />
      </button>
    </span>
  )
}

/** "Preferințe": language, theme, time zone and defaults for new clips, saved together. */
export function SettingsPreferencesSection({ panels, mobile }: Props) {
  const t = useTranslations('settings')
  const locale = useLocale()
  const preferences = panels.preferences
  if (!preferences) return <SettingsLoadState error={panels.error} onRetry={panels.reload} />
  const disabled = panels.disabled
  const language = LANGUAGES.find((option) => option.value === preferences.locale) ?? LANGUAGES[0]!
  return (
    <>
      <SettingsCard list title={t('page.appGroup')} data-settings-card="app-preferences">
        <SettingsChoice
          id="language"
          icon={Globe}
          label={t('language')}
          value={preferences.locale}
          selected={language}
          options={() => LANGUAGES}
          disabled={disabled}
          mobile={mobile}
          onChange={(value) => panels.changePreference('locale', value as AccountPreferences['locale'])}
        />
        <div className={styles.row} data-stack="">
          <IconCircle>
            <Moon aria-hidden="true" />
          </IconCircle>
          <span className={styles.rowLabel}>{t('theme')}</span>
          <Segmented
            label={t('theme')}
            value={preferences.theme}
            disabled={disabled}
            options={[
              { value: 'light', label: t('themeLight') },
              { value: 'dark', label: t('themeDark') },
              { value: 'system', label: t('themeSystem') }
            ]}
            onChange={(value) => panels.changePreference('theme', value)}
          />
        </div>
        <SettingsChoice
          id="timezone"
          icon={Globe2}
          label={t('timezone')}
          searchLabel={t('searchTimezone')}
          value={preferences.timezone}
          selected={timezoneOption(preferences.timezone, locale)}
          options={() => timezoneOptions(preferences.timezone, locale)}
          disabled={disabled}
          mobile={mobile}
          onChange={(value) => panels.changePreference('timezone', value)}
        />
      </SettingsCard>
      <SettingsCard list title={t('page.newClips')} data-settings-card="clip-preferences">
        <div className={styles.row} data-stack="">
          <IconCircle>
            <RectangleVertical aria-hidden="true" />
          </IconCircle>
          <span className={styles.rowLabel}>{t('page.defaultFormat')}</span>
          <Segmented
            label={t('page.defaultFormat')}
            value={preferences.defaultAspectRatio}
            disabled={disabled}
            wide
            options={RATIOS.map(({ value, width, height }) => ({
              value,
              label: (
                <>
                  <span className={controls.ratio} style={{ width, height }} aria-hidden="true" />
                  {value}
                </>
              )
            }))}
            onChange={(value) => panels.changePreference('defaultAspectRatio', value)}
          />
        </div>
        <div className={styles.row}>
          <IconCircle>
            <Rows3 aria-hidden="true" />
          </IconCircle>
          <span className={styles.rowLabel}>{t('page.clipCount')}</span>
          <Stepper value={preferences.defaultClipCount} disabled={disabled} onChange={(value) => panels.changePreference('defaultClipCount', value)} />
        </div>
      </SettingsCard>
      <div className={styles.actions}>
        {!mobile && (
          <button
            type="button"
            className={`${ui.button} ${ui.secondary} ${ui.focus}`}
            disabled={!panels.dirty || panels.busy !== null}
            onClick={panels.cancelPreferences}
            data-settings-preferences-cancel=""
          >
            {t('cancel')}
          </button>
        )}
        <button
          type="button"
          className={`${ui.button} ${ui.primary} ${ui.focus}`}
          disabled={!panels.dirty || panels.disabled}
          aria-busy={panels.busy === 'preferences' || undefined}
          onClick={() => void panels.savePreferences()}
          data-settings-preferences-save=""
        >
          {t('savePreferences')}
        </button>
      </div>
    </>
  )
}
