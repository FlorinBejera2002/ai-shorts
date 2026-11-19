'use client'

import { Link } from '@/i18n/navigation'
import { useTranslations } from 'next-intl'
import { SECTION_META, SETTINGS_SECTIONS, settingsHref, type SettingsSection } from './settings-types'
import styles from './settings.module.css'

/** Desktop section card on the left of every Settings page. */
export function SettingsNavigation({ section }: { section: SettingsSection }) {
  const t = useTranslations('settings')
  return (
    <nav className={styles.nav} aria-label={t('sectionNav')}>
      {SETTINGS_SECTIONS.map((id) => {
        const { label, icon: Icon } = SECTION_META[id]
        return (
          <Link
            key={id}
            href={settingsHref(id)}
            className={`${styles.navItem} ${styles.focus}`}
            aria-current={section === id ? 'page' : undefined}
            data-settings-nav={id}
          >
            <Icon aria-hidden="true" />
            {t(label)}
          </Link>
        )
      })}
    </nav>
  )
}
