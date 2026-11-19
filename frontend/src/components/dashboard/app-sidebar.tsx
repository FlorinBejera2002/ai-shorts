'use client'

import { useAuth } from '@/components/auth/use-auth'
import theme from '@/components/calendar/publishing-theme.module.css'
import { BrandLogo, ThemeBrandLogo } from '@/components/shared/brand-logo'
import { ProfileAvatar } from '@/components/shared/profile-avatar'
import referenceUi from '@/components/shared/reference-ui.module.css'
import { SignOutAction } from '@/components/shared/sign-out-action'
import { Button } from '@/components/ui/button'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar
} from '@/components/ui/sidebar'
import { Link, usePathname } from '@/i18n/navigation'
import {
  dashboardNavigation,
  isDashboardRouteActive
} from '@/lib/dashboard-navigation'
import { ArrowUpRight, Plus, X } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useEffect } from 'react'
import styles from './app-sidebar.module.css'
import { SidebarNavigationGroup } from './sidebar-navigation-group'
import { SidebarUsageCard } from './sidebar-usage-card'

function SidebarBrand({
  compact,
  onNavigate
}: {
  compact: boolean
  onNavigate: () => void
}) {
  return (
    <Link
      href="/dashboard"
      onClick={onNavigate}
      aria-label="Sneep Cut"
      className={styles.logo}
    >
      {compact ? <BrandLogo compact={true} /> : <ThemeBrandLogo />}
    </Link>
  )
}

function CreateClipsAction({
  pathname,
  onNavigate
}: {
  pathname: string
  onNavigate: () => void
}) {
  const t = useTranslations('nav')
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton
          asChild={true}
          tooltip={t('newProject')}
          className={styles.create}
        >
          <Link
            href="/dashboard/create"
            onClick={onNavigate}
            prefetch={false}
            aria-label={t('newProject')}
            aria-current={
              isDashboardRouteActive(pathname, '/dashboard/create')
                ? 'page'
                : undefined
            }
            data-sidebar-create=""
          >
            <Plus aria-hidden="true" className={styles.createIcon} />
            <span className={styles.createLabel}>{t('newProject')}</span>
            <ArrowUpRight aria-hidden="true" className={styles.createArrow} />
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}

function SidebarAccount() {
  const { user } = useAuth()
  const t = useTranslations('nav')
  const name = user?.name?.trim() || t('workspace')
  return (
    <div className={styles.account} data-sidebar-account="">
      <ProfileAvatar name={user?.name} src={user?.profile_pic} />
      <span className={styles.accountName} title={name}>
        {name}
      </span>
      <SignOutAction iconOnly={true} className={styles.signOut} />
    </div>
  )
}

export function AppSidebar() {
  const pathname = usePathname()
  const locale = useLocale()
  const t = useTranslations('nav')
  const { state, isMobile, setOpenMobile } = useSidebar()
  const compact = state === 'collapsed' && !isMobile
  useEffect(() => {
    if (pathname && locale) setOpenMobile(false)
  }, [pathname, locale, setOpenMobile])
  const close = () => setOpenMobile(false)

  return (
    <Sidebar
      collapsible="icon"
      className={styles.container}
      mobileTitle={t('mobileNavigation')}
      mobileDescription={t('navigationDescription')}
    >
      <div
        className={`${theme.surface} ${referenceUi.tokens} ${styles.panel}`}
        data-app-sidebar=""
      >
        <SidebarHeader className={styles.header}>
          <div className={styles.brandRow}>
            <SidebarBrand compact={compact} onNavigate={close} />
            {isMobile && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={close}
                aria-label={t('closeMenu')}
              >
                <X className="size-5" />
              </Button>
            )}
          </div>
          <CreateClipsAction pathname={pathname} onNavigate={close} />
        </SidebarHeader>
        <SidebarContent className={styles.content}>
          <nav
            id="dashboard-navigation"
            aria-label={t('mobileNavigation')}
            className={styles.navigation}
          >
            {dashboardNavigation.map((group) => (
              <SidebarNavigationGroup
                key={group.labelKey}
                group={group}
                pathname={pathname}
                onNavigate={close}
              />
            ))}
          </nav>
        </SidebarContent>
        <SidebarFooter className={styles.footer}>
          <SidebarUsageCard onNavigate={close} />
          <SidebarAccount />
        </SidebarFooter>
      </div>
    </Sidebar>
  )
}
