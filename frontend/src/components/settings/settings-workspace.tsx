'use client'

import { ConnectionSuccessOverlay } from '@/components/calendar/connection-success-overlay'
import ui from '@/components/shared/reference-ui.module.css'
import { useSwipeBack } from '@/hooks/use-swipe-back'
import { Link, useRouter } from '@/i18n/navigation'
import { ChevronLeft } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useMemo, useRef, type ReactNode } from 'react'
import { SettingsAccountSection } from './settings-account-section'
import { DisconnectDialog, YouTubeConsentDialog } from './settings-connection-dialogs'
import { SettingsConnectionsSection } from './settings-connections-section'
import { SettingsDeleteDialog } from './settings-delete-dialog'
import { SettingsMobileMenu } from './settings-mobile-menu'
import { SettingsNavigation } from './settings-navigation'
import { SettingsNotificationsSection } from './settings-notifications-section'
import { SettingsPreferencesSection } from './settings-preferences-section'
import { SettingsPrivacySection } from './settings-privacy-section'
import { SettingsSecuritySection } from './settings-security-section'
import { TwoFactorDialog } from './settings-two-factor-dialog'
import { SECTION_META, settingsHref, type Profile, type SettingsSection } from './settings-types'
import { useAccountSettings } from './use-account-settings'
import { useSettingsConnections } from './use-settings-connections'
import { useSettingsPanels } from './use-settings-panels'
import styles from './settings.module.css'

/** One mutation at a time across profile, settings and connection requests. */
function useMutationLock() {
  const locked = useRef(false)
  return useMemo(
    () => ({
      acquire: () => {
        if (locked.current) return false
        locked.current = true
        return true
      },
      release: () => {
        locked.current = false
      }
    }),
    []
  )
}

export function SettingsWorkspace({
  profile,
  section,
  mobile
}: {
  profile: Profile
  section: SettingsSection | null
  mobile: boolean
}) {
  const t = useTranslations('settings')
  const lock = useMutationLock()
  const panels = useSettingsPanels({ acquireMutation: lock.acquire, releaseMutation: lock.release })
  const connections = useSettingsConnections(lock)
  const account = useAccountSettings(profile, panels.busy !== null || connections.busy, lock.acquire, lock.release)
  const active = section ?? 'account'
  const router = useRouter()
  useSwipeBack(() => router.push(settingsHref(null)), mobile && section !== null)

  const sections: Record<SettingsSection, () => ReactNode> = {
    account: () => <SettingsAccountSection account={account} mobile={mobile} />,
    security: () => <SettingsSecuritySection account={account} panels={panels} mobile={mobile} />,
    connections: () => <SettingsConnectionsSection connections={connections} mobile={mobile} />,
    notifications: () => <SettingsNotificationsSection panels={panels} mobile={mobile} />,
    preferences: () => <SettingsPreferencesSection panels={panels} mobile={mobile} />,
    privacy: () => <SettingsPrivacySection account={account} panels={panels} mobile={mobile} />
  }

  return (
    <>
      {mobile && section === null ? (
        <SettingsMobileMenu profile={account.profile} connections={connections.data} />
      ) : (
        <>
          {!mobile && <h1 className={styles.title}>{t(SECTION_META[active].label)}</h1>}
          {account.profile.deletionPending && (
            <p role="alert" className={styles.alert}>
              {t('workspaceDesign.deletionPending')}
            </p>
          )}
          <div className={styles.layout}>
            {!mobile && <SettingsNavigation section={active} />}
            <div className={styles.content} data-settings-content={active}>
              {mobile && (
                <Link href={settingsHref(null)} className={`${ui.button} ${ui.secondary} ${ui.focus} ${styles.back}`} data-settings-back="">
                  <ChevronLeft aria-hidden="true" />
                  {t('page.back')}
                </Link>
              )}
              {sections[active]()}
            </div>
          </div>
        </>
      )}
      <TwoFactorDialog panels={panels} mobile={mobile} />
      <DisconnectDialog connections={connections} mobile={mobile} />
      <YouTubeConsentDialog connections={connections} mobile={mobile} />
      <SettingsDeleteDialog account={account} mobile={mobile} />
      {connections.connectedProvider && (
        <ConnectionSuccessOverlay
          key={connections.connectedProvider}
          provider={connections.connectedProvider}
          onComplete={connections.finishConfirmation}
        />
      )}
    </>
  )
}
