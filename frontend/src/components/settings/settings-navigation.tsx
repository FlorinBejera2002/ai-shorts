'use client'

import {
  Bell,
  Link2,
  LockKeyhole,
  Shield,
  SlidersHorizontal,
  UserRound,
  Pencil
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import type { SettingsSection } from './settings-types'
import styles from './settings-workspace.module.css'

const sections = [
  { id: 'account', label: 'workspaceDesign.account', icon: UserRound },
  { id: 'profile', label: 'workspaceDesign.profile', icon: Pencil },
  { id: 'security', label: 'workspaceDesign.security', icon: LockKeyhole },
  { id: 'connections', label: 'connections', icon: Link2 },
  { id: 'notifications', label: 'notifications', icon: Bell },
  { id: 'preferences', label: 'preferences', icon: SlidersHorizontal },
  { id: 'privacy', label: 'workspaceDesign.privacy', icon: Shield }
] as const

export function SettingsNavigation({
  section,
  onSectionChange
}: {
  section: SettingsSection
  onSectionChange: (section: SettingsSection) => void
}) {
  const t = useTranslations('settings')
  return (
    <nav className={styles.navigation} aria-label={t('sectionNav')}>
      <div className={styles.desktopNav}>
        {sections.map(({ id, label, icon: Icon }) => (
          <button
            type="button"
            key={id}
            data-settings-nav={id}
            aria-current={section === id ? 'page' : undefined}
            onClick={() => onSectionChange(id)}
          >
            <Icon aria-hidden="true" />
            <span>{t(label)}</span>
          </button>
        ))}
      </div>
      <div className={styles.mobileNav}>
        <Select
          value={section}
          onValueChange={(value) => onSectionChange(value as SettingsSection)}
        >
          <SelectTrigger
            id="settings-section"
            aria-label={t('sectionNav')}
            className={styles.sectionSelect}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper" className={styles.sectionOptions}>
            {sections.map(({ id, label, icon: Icon }) => (
              <SelectItem key={id} value={id}>
                <Icon aria-hidden="true" />
                {t(label)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </nav>
  )
}
