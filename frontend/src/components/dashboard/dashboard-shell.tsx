'use client'

import { AppSidebar } from '@/components/dashboard/app-sidebar'
import { Separator } from '@/components/ui/separator'
import {
  SidebarProvider,
  SidebarTrigger,
  useSidebar
} from '@/components/ui/sidebar'
import { usePathname } from '@/i18n/navigation'
import { dashboardRouteLabel } from '@/lib/dashboard-navigation'
import { useTranslations } from 'next-intl'

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
      <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur-sm sm:px-6">
        <SidebarTrigger
          aria-label={label}
          title={label}
          aria-expanded={isMobile ? openMobile : open}
          aria-controls="dashboard-navigation"
          className="size-9 shrink-0 text-muted-foreground hover:bg-muted hover:text-foreground"
        />
        <Separator orientation="vertical" className="h-4" />
        <div className="flex min-w-0 items-center gap-2 text-xs">
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
        <span
          aria-hidden="true"
          className="ml-auto hidden rounded border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground lg:block"
        >
          Ctrl / ⌘ B
        </span>
      </header>
      <main
        id="dashboard-main"
        tabIndex={-1}
        className="min-w-0 flex-1 outline-none"
      >
        <div className="page-shell relative py-6 sm:py-8">{children}</div>
      </main>
    </div>
  )
}

export function DashboardShell({
  children,
  defaultOpen
}: { children: React.ReactNode; defaultOpen: boolean }) {
  const t = useTranslations('nav')
  return (
    <SidebarProvider
      defaultOpen={defaultOpen}
      id="dashboard-shell"
      className="bg-background text-foreground"
    >
      <a
        href="#dashboard-main"
        className="fixed left-4 top-3 z-[100] -translate-y-20 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground shadow-lg focus:translate-y-0"
      >
        {t('skipContent')}
      </a>
      <AppSidebar />
      <DashboardContent>{children}</DashboardContent>
    </SidebarProvider>
  )
}
