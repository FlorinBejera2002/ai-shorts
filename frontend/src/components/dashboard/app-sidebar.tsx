'use client'

import { BrandLogo } from '@/components/shared/brand-logo'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
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
  SidebarSeparator,
  useSidebar
} from '@/components/ui/sidebar'
import { Link, usePathname, useRouter } from '@/i18n/navigation'
import {
  dashboardNavigation,
  isDashboardRouteActive
} from '@/lib/dashboard-navigation'
import {
  BarChart3,
  CalendarDays,
  ChevronUp,
  Clock,
  CreditCard,
  FileText,
  Film,
  LayoutDashboard,
  ListChecks,
  Monitor,
  Moon,
  Palette,
  Plus,
  Settings,
  Share2,
  SlidersHorizontal,
  Sun,
  X
} from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useTheme } from 'next-themes'
import { useEffect } from 'react'

const icons = {
  home: LayoutDashboard,
  review: ListChecks,
  clips: Film,
  history: Clock,
  analytics: BarChart3,
  calendar: CalendarDays,
  scripts: FileText,
  publish: Share2,
  brand: Palette,
  billing: CreditCard,
  settings: Settings
}
const menuClass =
  'h-11 gap-3 rounded-lg text-[13px] lg:h-9 data-[active=true]:bg-sidebar-primary data-[active=true]:text-sidebar-primary-foreground data-[active=true]:font-semibold group-data-[collapsible=icon]:[&>span]:hidden'

function SidebarPreferences() {
  const t = useTranslations('nav')
  const s = useTranslations('settings')
  const locale = useLocale()
  const pathname = usePathname()
  const router = useRouter()
  const { theme, setTheme } = useTheme()
  const { isMobile, setOpenMobile } = useSidebar()

  function changeLocale(value: string) {
    if (value !== 'en' && value !== 'ro') return
    setOpenMobile(false)
    router.replace(
      `${pathname}${window.location.search}${window.location.hash}`,
      { locale: value }
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild={true}>
        <SidebarMenuButton
          tooltip={t('preferences')}
          aria-label={t('preferences')}
          className={`${menuClass} h-12 border border-sidebar-border bg-sidebar-accent/40 lg:h-12`}
        >
          <SlidersHorizontal className="size-4" />
          <span className="flex flex-1 flex-col gap-0.5">
            <span className="text-xs font-medium text-sidebar-accent-foreground">
              {t('workspace')}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {t('preferences')}
            </span>
          </span>
          <ChevronUp className="ml-auto size-3.5 group-data-[collapsible=icon]:hidden" />
        </SidebarMenuButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side={isMobile ? 'top' : 'right'}
        align="end"
        sideOffset={12}
        className="w-56"
      >
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          {s('theme')}
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={theme ?? 'system'}
          onValueChange={setTheme}
        >
          <DropdownMenuRadioItem value="light">
            <Sun className="mr-2 size-4" />
            {s('themeLight')}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">
            <Moon className="mr-2 size-4" />
            {s('themeDark')}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">
            <Monitor className="mr-2 size-4" />
            {s('themeSystem')}
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          {t('language')}
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup value={locale} onValueChange={changeLocale}>
          <DropdownMenuRadioItem value="en">English</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="ro">Română</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
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
      <SidebarHeader className="gap-4 px-4 pb-4 pt-5 group-data-[collapsible=icon]:px-2">
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
              className="h-10 justify-center gap-2 rounded-lg bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 hover:text-primary-foreground active:bg-primary/90 active:text-primary-foreground group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:[&>span]:hidden"
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
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarSeparator />
      <SidebarContent className="gap-0 py-2">
        <nav id="dashboard-navigation" aria-label={t('mobileNavigation')}>
          {dashboardNavigation.map((group) => (
            <SidebarGroup
              key={group.labelKey}
              className="px-3 py-1.5 group-data-[collapsible=icon]:px-4"
            >
              <SidebarGroupLabel className="text-[9px] font-semibold uppercase tracking-[0.16em]">
                {t(group.labelKey)}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu className="gap-0.5">
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
                            <Icon strokeWidth={1.75} />
                            <span>{t(item.key)}</span>
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
      <SidebarFooter className="border-t border-sidebar-border p-3 group-data-[collapsible=icon]:p-4">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarPreferences />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
