'use client'

import { useAuth } from '@/components/auth/auth-guard'
import { BrandLogo } from '@/components/shared/brand-logo'
import { ProfileAvatar } from '@/components/shared/profile-avatar'
import { SignOutAction } from '@/components/shared/sign-out-action'
import { Button } from '@/components/ui/button'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
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
import {
  ArrowUpRight,
  CalendarDays,
  CreditCard,
  FileText,
  Film,
  FolderOpen,
  LayoutDashboard,
  Palette,
  Plus,
  Settings,
  Share2,
  X
} from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useEffect } from 'react'
import styles from './app-sidebar.module.css'

const icons = {
  home: LayoutDashboard,
  clips: Film,
  history: FolderOpen,
  calendar: CalendarDays,
  publish: Share2,
  scripts: FileText,
  settings: Settings,
  brand: Palette,
  billing: CreditCard
}
const menuClass = styles.navItem

function SidebarProfile() {
  const { user } = useAuth()
  const t = useTranslations('nav')
  return (
    <div className={styles.profileRow}>
      <ProfileAvatar name={user?.name} src={user?.profile_pic} />
      <span
        className={styles.profileName}
        title={user?.name?.trim() || t('workspace')}
      >
        {user?.name?.trim() || t('workspace')}
      </span>
      <SignOutAction iconOnly={true} />
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
      mobileTitle={t('mobileNavigation')}
      mobileDescription={t('navigationDescription')}
    >
      <SidebarHeader
        className={`${styles.header} group-data-[collapsible=icon]:px-2`}
      >
        <div className="flex min-h-10 items-center justify-between gap-2">
          <Link
            href="/dashboard"
            onClick={close}
            aria-label="Sneepcut"
            className="rounded-lg focus-visible:outline-2 focus-visible:outline-ring"
          >
            {compact ? (
              <BrandLogo compact={true} className="size-10" />
            ) : (
              <>
                <BrandLogo className="h-10 dark:hidden" />
                <span className="hidden dark:inline-flex">
                  <BrandLogo variant="white-text" className="h-10" />
                </span>
              </>
            )}
          </Link>
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
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild={true}
              tooltip={t('newProject')}
              className={`${styles.create} group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:[&>span]:hidden`}
            >
              <Link
                href="/dashboard/create"
                onClick={close}
                prefetch={false}
                aria-label={t('newProject')}
                aria-current={
                  isDashboardRouteActive(pathname, '/dashboard/create')
                    ? 'page'
                    : undefined
                }
              >
                <Plus className="size-4" />
                <span>{t('newProject')}</span>
                <ArrowUpRight
                  className={styles.createArrow}
                  aria-hidden="true"
                />
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent className={styles.content}>
        <nav id="dashboard-navigation" aria-label={t('mobileNavigation')}>
          {dashboardNavigation.map((group) => (
            <SidebarGroup
              key={group.labelKey}
              className={`${styles.group} group-data-[collapsible=icon]:px-4`}
            >
              {group.labelKey !== 'groupWorkspace' && (
                <SidebarGroupLabel className={styles.groupLabel}>
                  {t(group.labelKey)}
                </SidebarGroupLabel>
              )}
              <SidebarGroupContent>
                <SidebarMenu className="gap-1.5">
                  {group.items.map((item) => {
                    const Icon = icons[item.key]
                    const active = isDashboardRouteActive(pathname, item.href)
                    return (
                      <SidebarMenuItem key={item.href}>
                        <SidebarMenuButton
                          asChild={true}
                          isActive={active}
                          tooltip={t(item.key)}
                          className={menuClass}
                        >
                          <Link
                            href={item.href}
                            onClick={close}
                            prefetch={false}
                            aria-label={t(item.key)}
                            aria-current={active ? 'page' : undefined}
                          >
                            <span className={styles.navIcon}>
                              <Icon strokeWidth={1.75} />
                            </span>
                            <span className={styles.navLabel}>
                              {t(item.key)}
                            </span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    )
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
        </nav>
      </SidebarContent>
      <SidebarFooter
        className={`${styles.footer} group-data-[collapsible=icon]:p-4`}
      >
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarProfile />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
