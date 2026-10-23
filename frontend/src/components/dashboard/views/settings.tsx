'use client'

import { AccountSettings } from '@/components/settings/account-settings'
import { SettingsShell } from '@/components/settings/settings-shell'
import type {
  Profile,
  SettingsSection
} from '@/components/settings/settings-types'
import { Button } from '@/components/ui/button'
import { LoadingIndicator } from '@/components/ui/loading-indicator'
import { useApiResource } from '@/hooks/use-api-resource'
import { CircleAlert } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import styles from '@/components/settings/settings-workspace.module.css'

export default function SettingsPage() {
  const t = useTranslations('settings')
  const [section, setSection] = useState<SettingsSection>(() => {
    const fromHash = window.location.hash.slice(1).replace(/-title$/, '')
    return [
      'account',
      'profile',
      'security',
      'connections',
      'notifications',
      'preferences',
      'privacy'
    ].includes(fromHash)
      ? (fromHash as SettingsSection)
      : 'account'
  })
  const { data, error, reload } = useApiResource<{ profile: Profile }>(
    '/api/user/profile'
  )
  return (
    <SettingsShell section={section} onSectionChange={setSection}>
      {data ? (
        <AccountSettings
          initialProfile={data.profile}
          section={section}
          onSectionChange={setSection}
        />
      ) : (
        <div
          className={styles.initial}
          data-settings-initial={error ? 'error' : 'loading'}
          role={error ? 'alert' : 'status'}
        >
          {error ? (
            <CircleAlert
              className={styles.initialErrorIcon}
              aria-hidden="true"
            />
          ) : (
            <LoadingIndicator className="size-8" />
          )}
          <p>
            {t(error ? 'workspaceDesign.loadError' : 'workspaceDesign.loading')}
          </p>
          {error && <Button onClick={reload}>{t('retry')}</Button>}
        </div>
      )}
    </SettingsShell>
  )
}
