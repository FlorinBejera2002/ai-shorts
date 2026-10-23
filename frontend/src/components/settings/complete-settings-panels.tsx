'use client'

import { SettingsExportHistory } from './settings-export-history'
import {
  SettingsNotificationPanel,
  SettingsPreferencesPanel
} from './settings-preferences-panel'
import { SettingsSecurityPanel } from './settings-security-panel'
import { SettingsPanelStatus } from './settings-panel-status'
import { useSettingsPanels } from './use-settings-panels'
import type { ReactNode } from 'react'

interface CompleteSettingsPanelsProps {
  section:
    | 'account'
    | 'profile'
    | 'security'
    | 'connections'
    | 'notifications'
    | 'preferences'
    | 'privacy'
  securityIntro?: ReactNode
  securityHint?: ReactNode
  privacyIntro?: ReactNode
  privacyFooter?: ReactNode
  disabled?: boolean
  onBusyChange?: (busy: boolean) => void
  acquireMutation?: () => boolean
  releaseMutation?: () => void
}

export function CompleteSettingsPanels({
  section,
  securityIntro,
  securityHint,
  privacyIntro,
  privacyFooter,
  ...mutationOptions
}: CompleteSettingsPanelsProps) {
  const controller = useSettingsPanels(mutationOptions)
  const { data, preferences, error, reload } = controller
  const visible = [
    'security',
    'notifications',
    'preferences',
    'privacy'
  ].includes(section)

  if (!data || !preferences) {
    return (
      <div hidden={!visible}>
        <SettingsPanelStatus error={error} onRetry={reload} />
      </div>
    )
  }

  return (
    <>
      <section hidden={section !== 'security'} data-settings-panel="security">
        <SettingsSecurityPanel
          controller={controller}
          intro={securityIntro}
          hint={securityHint}
        />
      </section>
      <section
        hidden={section !== 'notifications'}
        data-settings-panel="notifications"
      >
        <SettingsNotificationPanel
          controller={controller}
          preferences={preferences}
        />
      </section>
      <section
        hidden={section !== 'preferences'}
        data-settings-panel="preferences"
      >
        <SettingsPreferencesPanel
          controller={controller}
          preferences={preferences}
        />
      </section>
      <section hidden={section !== 'privacy'} data-settings-panel="privacy">
        {privacyIntro}
        <SettingsExportHistory
          exports={data.exports}
          timezone={data.preferences.timezone}
        />
        {privacyFooter}
      </section>
    </>
  )
}
