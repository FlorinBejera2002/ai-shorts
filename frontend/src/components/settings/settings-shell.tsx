'use client'

import { WorkspaceMobileHeader } from '@/components/dashboard/workspace-mobile-header'
import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'
import { SettingsNavigation } from './settings-navigation'
import type { SettingsSection } from './settings-types'
import styles from './settings-workspace.module.css'
import theme from '@/components/calendar/publishing-theme.module.css'

export function SettingsShell({
  section,
  onSectionChange,
  children
}: {
  section: SettingsSection
  onSectionChange: (section: SettingsSection) => void
  children: ReactNode
}) {
  const t = useTranslations('settings')
  return (
    <div
      className={`${theme.surface} ${styles.workspace}`}
      data-reference-surface=""
      data-settings-workspace=""
    >
      <WorkspaceMobileHeader />
      <h1 className={styles.title}>{t('title')}</h1>
      <div className={styles.layout}>
        <SettingsNavigation
          section={section}
          onSectionChange={onSectionChange}
        />
        <div className={styles.content}>{children}</div>
      </div>
    </div>
  )
}
