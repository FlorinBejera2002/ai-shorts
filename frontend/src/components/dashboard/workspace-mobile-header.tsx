'use client'

import { useAuth } from '@/components/auth/use-auth'
import { BrandLogo, ThemeBrandLogo } from '@/components/shared/brand-logo'
import { ProfileAvatar } from '@/components/shared/profile-avatar'
import { Button } from '@/components/ui/button'
import { useSidebar } from '@/components/ui/sidebar'
import { Link } from '@/i18n/navigation'
import { Menu } from 'lucide-react'
import { useTranslations } from 'next-intl'
import styles from './workspace-mobile-header.module.css'

/**
 * Mobile workspace header.
 * - `profile` (default, reference canvas): logo + profile; navigation lives in the bottom dock.
 * - `menu`: the approved Publish/Clips/Scripts header with the sidebar drawer toggle (hides the dock).
 */
export function WorkspaceMobileHeader({
  appearance = 'theme',
  variant = 'profile'
}: {
  appearance?: 'theme' | 'light'
  variant?: 'profile' | 'menu'
}) {
  const t = useTranslations('nav')
  const { user } = useAuth()
  const { openMobile, toggleSidebar } = useSidebar()
  const logo = appearance === 'light' ? <BrandLogo size="md" /> : <ThemeBrandLogo size="md" />

  if (variant === 'menu')
    return (
      <div className={styles.menuHeader} data-workspace-mobile-header="menu">
        <Button
          variant="outline"
          size="icon"
          onClick={toggleSidebar}
          aria-label={openMobile ? t('closeMenu') : t('openMenu')}
          aria-expanded={openMobile}
          aria-controls="dashboard-navigation"
          className="size-10 shrink-0 bg-muted/30 text-foreground hover:bg-muted"
        >
          <Menu className="size-6" />
        </Button>
        {logo}
      </div>
    )

  return (
    <div className={styles.header} data-workspace-mobile-header="profile">
      <Link href="/dashboard" aria-label="Sneepcut">
        {logo}
      </Link>
      <span className={styles.spacer} />
      <Link href="/dashboard/settings" className={styles.profile} aria-label={t('settings')}>
        <ProfileAvatar name={user?.name} src={user?.profile_pic} />
      </Link>
    </div>
  )
}
