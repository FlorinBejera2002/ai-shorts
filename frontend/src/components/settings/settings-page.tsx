'use client'

import theme from '@/components/calendar/publishing-theme.module.css'
import { WorkspaceMobileHeader } from '@/components/dashboard/workspace-mobile-header'
import ui from '@/components/shared/reference-ui.module.css'
import { useApiResource } from '@/hooks/use-api-resource'
import { useIsMobile } from '@/hooks/use-mobile'
import { useSearchParams } from 'next/navigation'
import { SettingsLoadState } from './settings-load-state'
import { SettingsWorkspace } from './settings-workspace'
import { checked, isProfileResponse } from './settings-data'
import { parseSettingsSection, type Profile } from './settings-types'
import styles from './settings.module.css'

/** `/dashboard/settings[?section=…]`: desktop shows a section, phones start at the menu. */
export function SettingsPage() {
  const mobile = useIsMobile()
  const section = parseSettingsSection(useSearchParams().get('section'))
  const resource = useApiResource<{ profile: Profile }>('/api/user/profile')
  const { data, error } = checked(resource, isProfileResponse)
  const profile = data?.profile
  return (
    <div
      className={`${theme.surface} ${ui.tokens} ${styles.page}`}
      data-reference-surface=""
      data-settings-workspace=""
      data-settings-view={mobile && !section ? 'menu' : (section ?? 'account')}
    >
      <WorkspaceMobileHeader />
      {profile ? (
        <SettingsWorkspace profile={profile} section={section} mobile={mobile} />
      ) : (
        <SettingsLoadState error={error} onRetry={resource.reload} />
      )}
    </div>
  )
}
