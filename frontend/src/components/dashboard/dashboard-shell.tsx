'use client'

import { AppSidebar } from '@/components/dashboard/app-sidebar'
import { MobileDashboardDock } from '@/components/dashboard/mobile-dashboard-dock'
import { WorkspaceSearch } from '@/components/dashboard/workspace-search'
import { Separator } from '@/components/ui/separator'
import {
  SidebarProvider,
  SidebarTrigger,
  useSidebar
} from '@/components/ui/sidebar'
import { usePathname } from '@/i18n/navigation'
import { dashboardRouteLabel } from '@/lib/dashboard-navigation'
import { MotionConfig } from 'framer-motion'
import { Clapperboard } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { type MouseEvent, useEffect, useState } from 'react'
import './studio-shell.css'

function DashboardContent({ children }: { children: React.ReactNode }) {
  const t = useTranslations('nav')
  const pathname = usePathname()
  const { open, isMobile, openMobile } = useSidebar()
  const label = isMobile
    ? openMobile
      ? t('closeMenu')
      : t('openMenu')
    : open
      ? t('collapseSidebar')
      : t('expandSidebar')

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <header className="studio-topbar sticky top-0 z-30 hidden h-16 shrink-0 items-center gap-3 border-b px-6 lg:flex">
        <div className="studio-topbar-start flex min-w-0 items-center gap-3">
          <SidebarTrigger
            aria-label={label}
            title={label}
            aria-expanded={isMobile ? openMobile : open}
            aria-controls="dashboard-navigation"
            className="hidden size-9 shrink-0 text-muted-foreground hover:bg-muted hover:text-foreground lg:inline-flex"
          />
          <Separator orientation="vertical" className="!h-4 max-lg:hidden" />
          <div className="studio-breadcrumb flex min-w-0 items-center gap-2 text-xs">
            <Clapperboard
              aria-hidden="true"
              className="hidden size-4 text-primary sm:block"
            />
            <span className="hidden text-muted-foreground sm:inline">
              {t('workspace')}
            </span>
            <span aria-hidden="true" className="hidden text-border sm:inline">
              /
            </span>
            <span className="truncate font-medium">
              {t(dashboardRouteLabel(pathname))}
            </span>
          </div>
        </div>
        <div id="studio-section-navigation" className="min-w-0" />
        <div className="ml-auto hidden shrink-0 items-center gap-2 sm:gap-4 lg:flex">
          <WorkspaceSearch />
        </div>
      </header>
      <main
        id="dashboard-main"
        tabIndex={-1}
        className="min-w-0 flex-1 pb-24 outline-none lg:pb-0"
      >
        <div
          key={pathname}
          className="page-shell studio-page studio-page-enter relative py-5 sm:py-6"
        >
          {children}
        </div>
      </main>
    </div>
  )
}

export function DashboardShell({
  children,
  defaultOpen
}: { children: React.ReactNode; defaultOpen: boolean }) {
  const t = useTranslations('nav')
  const pathname = usePathname()
  const [navigating, setNavigating] = useState(false)

  useEffect(() => setNavigating(false), [pathname])

  function handleNavigation(event: MouseEvent<HTMLDivElement>) {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return
    }
    const target = event.target
    if (!(target instanceof Element)) return
    const anchor = target.closest<HTMLAnchorElement>('a[href]')
    if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download')) {
      return
    }
    const destination = new URL(anchor.href, window.location.href)
    if (
      destination.origin !== window.location.origin ||
      destination.hash ||
      `${destination.pathname}${destination.search}` ===
        `${window.location.pathname}${window.location.search}`
    ) {
      return
    }
    setNavigating(true)
  }

  return (
    <MotionConfig reducedMotion="user">
      <SidebarProvider
        defaultOpen={defaultOpen}
        id="dashboard-shell"
        className="bg-background text-foreground"
        onClickCapture={handleNavigation}
      >
        {navigating && (
          <div
            className="fixed inset-0 z-[190] flex items-center justify-center bg-background/72 backdrop-blur-sm"
            role="status"
            aria-live="polite"
            aria-label="Loading"
          >
            <img
              src="/brand/black-loading.gif"
              alt=""
              width={96}
              height={96}
              className="size-24 object-contain"
            />
            <span className="sr-only">Loading</span>
          </div>
        )}
        <a
          href="#dashboard-main"
          className="fixed left-4 top-3 z-[100] -translate-y-20 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground shadow-lg focus:translate-y-0"
        >
          {t('skipContent')}
        </a>
        <AppSidebar />
        <MobileDashboardDock />
        <DashboardContent>{children}</DashboardContent>
      </SidebarProvider>
    </MotionConfig>
  )
}
