import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LoadingIndicator } from '@/components/ui/loading-indicator'
import { Switch } from '@/components/ui/switch'
import type { AccountPreferences } from '@/lib/settings'
import { useTranslations } from 'next-intl'
import { useId } from 'react'
import { SettingsSelect } from './settings-select'
import { SettingsPanelFeedback } from './settings-panel-status'
import type { SettingsPanelsController } from './use-settings-panels'
import styles from './settings-panels.module.css'

const TIMEZONES = [
  'UTC',
  'Europe/Bucharest',
  'Europe/London',
  'Europe/Paris',
  'America/New_York',
  'America/Los_Angeles',
  'Asia/Dubai',
  'Asia/Tokyo'
] as const
type PanelProps = {
  controller: SettingsPanelsController
  preferences: AccountPreferences
}
type NotificationKey =
  | 'emailSecurity'
  | 'emailProduct'
  | 'emailMarketing'
  | 'inAppProcessing'
  | 'inAppPublishing'

function NotificationSwitch({
  controller,
  preferences,
  preference,
  label,
  description,
  showDescription = false
}: PanelProps & {
  preference: NotificationKey
  label: string
  description: string
  showDescription?: boolean
}) {
  const id = useId()
  return (
    <div className={styles.switchRow}>
      <div>
        <Label className={styles.switchLabel} htmlFor={id}>
          {label}
        </Label>
        <p
          id={`${id}-hint`}
          className={showDescription ? styles.hint : 'sr-only'}
        >
          {description}
        </p>
      </div>
      <Switch
        id={id}
        data-settings-switch={preference}
        checked={preferences[preference]}
        disabled={controller.disabled}
        onCheckedChange={(value) =>
          controller.changePreference(preference, value)
        }
        aria-describedby={`${id}-hint`}
      />
    </div>
  )
}

function SavePreferences({
  controller
}: {
  controller: SettingsPanelsController
}) {
  const t = useTranslations('settings')
  const count = controller.preferences?.defaultClipCount ?? 0
  const valid = Number.isInteger(count) && count >= 1 && count <= 10
  return (
    <div className={styles.saveArea}>
      <SettingsPanelFeedback controller={controller} group="preferences" />
      <Button
        type="submit"
        className={styles.primaryAction}
        disabled={controller.disabled || !valid}
        data-settings-preferences-save
      >
        {controller.busy === 'preferences' && (
          <LoadingIndicator className="size-4" />
        )}
        {t('savePreferences')}
      </Button>
    </div>
  )
}

export function SettingsNotificationPanel({
  controller,
  preferences
}: PanelProps) {
  const t = useTranslations('settings')
  return (
    <form
      className={styles.panel}
      onSubmit={(event) => {
        event.preventDefault()
        void controller.savePreferences()
      }}
    >
      <h2 className={styles.heading}>{t('notifications')}</h2>
      <fieldset className={styles.notificationGroup}>
        <legend>{t('panelsDesign.emailGroup')}</legend>
        <NotificationSwitch
          controller={controller}
          preferences={preferences}
          preference="emailSecurity"
          label={t('securityEmails')}
          description={t('panelsDesign.securityEmailsHint')}
          showDescription
        />
        <NotificationSwitch
          controller={controller}
          preferences={preferences}
          preference="emailProduct"
          label={t('productEmails')}
          description={t('productEmailsDesc')}
        />
        <NotificationSwitch
          controller={controller}
          preferences={preferences}
          preference="emailMarketing"
          label={t('marketingEmails')}
          description={t('marketingEmailsDesc')}
        />
      </fieldset>
      <fieldset className={styles.notificationGroup}>
        <legend>{t('panelsDesign.inAppGroup')}</legend>
        <NotificationSwitch
          controller={controller}
          preferences={preferences}
          preference="inAppProcessing"
          label={t('processingNotifications')}
          description={t('processingNotificationsDesc')}
        />
        <NotificationSwitch
          controller={controller}
          preferences={preferences}
          preference="inAppPublishing"
          label={t('publishingNotifications')}
          description={t('publishingNotificationsDesc')}
        />
      </fieldset>
      <SavePreferences controller={controller} />
    </form>
  )
}

export function SettingsPreferencesPanel({
  controller,
  preferences
}: PanelProps) {
  const t = useTranslations('settings')
  return (
    <form
      className={styles.panel}
      onSubmit={(event) => {
        event.preventDefault()
        void controller.savePreferences()
      }}
    >
      <h2 className={styles.heading}>{t('preferences')}</h2>
      <div className={styles.preferencesGrid}>
        <SettingsSelect
          id="settings-locale"
          label={t('language')}
          value={preferences.locale}
          options={[
            { value: 'en', label: 'English' },
            { value: 'ro', label: 'Română' }
          ]}
          disabled={controller.disabled}
          onChange={(value) => controller.changePreference('locale', value)}
        />
        <SettingsSelect
          id="settings-theme"
          label={t('theme')}
          value={preferences.theme}
          options={[
            { value: 'system', label: t('themeSystem') },
            { value: 'light', label: t('themeLight') },
            { value: 'dark', label: t('themeDark') }
          ]}
          disabled={controller.disabled}
          onChange={(value) => controller.changePreference('theme', value)}
        />
        <div className={styles.timezoneField}>
          <SettingsSelect
            id="settings-timezone"
            label={t('timezone')}
            value={preferences.timezone}
            options={Array.from(
              new Set([...TIMEZONES, preferences.timezone])
            ).map((zone) => ({ value: zone, label: zone }))}
            disabled={controller.disabled}
            onChange={(value) => controller.changePreference('timezone', value)}
          />
        </div>
        <SettingsSelect
          id="settings-aspect"
          label={t('defaultAspectRatio')}
          value={preferences.defaultAspectRatio}
          options={[
            { value: '9:16', label: '9:16' },
            { value: '1:1', label: '1:1' },
            { value: '16:9', label: '16:9' }
          ]}
          disabled={controller.disabled}
          onChange={(value) =>
            controller.changePreference('defaultAspectRatio', value)
          }
        />
        <div className={`${styles.field} ${styles.clipCountField}`}>
          <Label htmlFor="settings-clips" className={styles.label}>
            {t('defaultClipCount')}
          </Label>
          <Input
            id="settings-clips"
            type="number"
            min={1}
            max={10}
            step={1}
            value={preferences.defaultClipCount || ''}
            className={styles.input}
            disabled={controller.disabled}
            aria-describedby="settings-clips-hint"
            onChange={(event) =>
              controller.changePreference(
                'defaultClipCount',
                Number(event.target.value)
              )
            }
          />
          <p id="settings-clips-hint" className={styles.hint}>
            1 – 10
          </p>
        </div>
      </div>
      <SavePreferences controller={controller} />
    </form>
  )
}
