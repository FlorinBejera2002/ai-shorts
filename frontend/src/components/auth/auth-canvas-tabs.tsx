'use client'

import { Link } from '@/i18n/navigation'
import { useTranslations } from 'next-intl'
import styles from './auth-canvas.module.css'

type AuthTab = 'login' | 'register'

const TABS: { key: AuthTab; href: '/login' | '/register' }[] = [
  { key: 'login', href: '/login' },
  { key: 'register', href: '/register' }
]

/** Sign in / create account switch shown at the top of the auth card. */
export function AuthCanvasTabs({ active }: { active: AuthTab }) {
  const t = useTranslations('auth')
  const tc = useTranslations('authCanvas')
  const labels: Record<AuthTab, string> = {
    login: t('signIn'),
    register: t('createAccount')
  }

  return (
    <div role="tablist" aria-label={tc('tabsLabel')} className={styles.tabs}>
      {TABS.map((tab) => {
        const selected = tab.key === active
        return (
          <Link
            key={tab.key}
            href={tab.href}
            role="tab"
            aria-selected={selected}
            className={
              selected ? `${styles.tab} ${styles.tabActive}` : styles.tab
            }
          >
            {labels[tab.key]}
          </Link>
        )
      })}
    </div>
  )
}
