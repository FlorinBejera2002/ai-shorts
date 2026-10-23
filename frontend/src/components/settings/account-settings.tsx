'use client'

import { CompleteSettingsPanels } from './complete-settings-panels'
import { ConnectedAccountsSettings } from './connected-accounts-settings'
import { SettingsAccountPanel } from './settings-account-panel'
import { SettingsProfilePanel } from './settings-profile-panel'
import { SettingsPasswordPanel } from './settings-password-panel'
import {
  SettingsPrivacyIntro,
  SettingsPrivacyFooter,
  SettingsDeleteDialog
} from './settings-privacy-panels'
import { useAccountSettings } from './use-account-settings'
import type { Profile, SettingsSection } from './settings-types'
import { useCallback, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useApiResource } from '@/hooks/use-api-resource'
import { useSocialConnection } from '@/hooks/use-social-connection'
import type { PublishingData } from '@/lib/publishing'
import styles from './settings-workspace.module.css'

export type { Profile } from './settings-types'

export function AccountSettings({
  initialProfile,
  section,
  onSectionChange
}: {
  initialProfile: Profile
  section: SettingsSection
  onSectionChange: (section: SettingsSection) => void
}) {
  const t = useTranslations('settings')
  const [panelsBusy, setPanelsBusy] = useState(false)
  const [connectionsBusy, setConnectionsBusy] = useState(false)
  const connectionsResource = useApiResource<PublishingData>('/api/publishing')
  const connection = useSocialConnection(connectionsResource.reload)
  const connectionPending = connectionsBusy || connection.busyProvider !== null
  const mutationLock = useRef(false)
  const acquireMutation = useCallback(() => {
    if (mutationLock.current) return false
    mutationLock.current = true
    return true
  }, [])
  const releaseMutation = useCallback(() => {
    mutationLock.current = false
  }, [])
  const account = useAccountSettings(
    initialProfile,
    panelsBusy || connectionPending,
    acquireMutation,
    releaseMutation
  )
  return (
    <>
      {account.profile.deletionPending && (
        <div role="alert" className={styles.warning}>
          {t('workspaceDesign.deletionPending')}
        </div>
      )}
      <div hidden={section !== 'account'} data-settings-section="account">
        <SettingsAccountPanel
          profile={account.profile}
          disabled={account.blocked}
          onSectionChange={onSectionChange}
        />
      </div>
      <div hidden={section !== 'profile'} data-settings-section="profile">
        <SettingsProfilePanel account={account} />
      </div>
      <div
        hidden={section !== 'connections'}
        data-settings-section="connections"
      >
        <ConnectedAccountsSettings
          resource={connectionsResource}
          connection={connection}
          disabled={account.busy !== null || panelsBusy}
          onBusyChange={setConnectionsBusy}
          acquireMutation={acquireMutation}
          releaseMutation={releaseMutation}
        />
      </div>
      <CompleteSettingsPanels
        section={section}
        securityIntro={<SettingsPasswordPanel account={account} />}
        securityHint={
          !account.profile.canChangePassword ? (
            <p className={styles.hint}>
              {t('workspaceDesign.providerMfaHint')}
            </p>
          ) : undefined
        }
        privacyIntro={<SettingsPrivacyIntro account={account} />}
        privacyFooter={<SettingsPrivacyFooter account={account} />}
        disabled={account.busy !== null || connectionPending}
        onBusyChange={setPanelsBusy}
        acquireMutation={acquireMutation}
        releaseMutation={releaseMutation}
      />
      <SettingsDeleteDialog account={account} />
    </>
  )
}
