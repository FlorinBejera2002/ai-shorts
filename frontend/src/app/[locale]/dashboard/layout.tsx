'use client'

import {
  BarChart3,
  Clock,
  CreditCard,
  FileText,
  Film,
  LayoutDashboard,
  ListChecks,
  Menu,
  Palette,
  Settings,
  Share2,
  Sparkles,
  X
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'
import { LanguageSwitcher } from '@/components/shared/language-switcher'
import { ThemeToggle } from '@/components/shared/theme-toggle'
import { Link, usePathname } from '@/i18n/navigation'

const navGroups = [
  {
    labelKey: 'groupStudio',
    items: [
      { href: '/dashboard', key: 'home', icon: LayoutDashboard, exact: true },
      { href: '/dashboard/create', key: 'create', icon: Sparkles },
      { href: '/dashboard/review', key: 'review', icon: ListChecks }
    ]
  },
  {
    labelKey: 'groupLibrary',
    items: [
      { href: '/dashboard/clips', key: 'clips', icon: Film },
      { href: '/dashboard/history', key: 'history', icon: Clock }
    ]
  },
  {
    labelKey: 'groupGrow',
    items: [
      { href: '/dashboard/analytics', key: 'analytics', icon: BarChart3 },
      { href: '/dashboard/script-generator', key: 'scripts', icon: FileText },
      { href: '/dashboard/publish', key: 'publish', icon: Share2 }
    ]
  },
  {
    labelKey: 'groupWorkspace',
    items: [
      { href: '/dashboard/brand', key: 'brand', icon: Palette },
      { href: '/dashboard/billing', key: 'billing', icon: CreditCard },
      { href: '/dashboard/settings', key: 'settings', icon: Settings }
    ]
  }
]

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname()
  const t = useTranslations('nav')

  return (
    <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-5">
      {navGroups.map((group) => (
        <div key={group.labelKey}>
          <div className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-sidebar-foreground/50">
            {t(group.labelKey)}
          </div>
          <div className="space-y-0.5">
            {group.items.map((item) => {
              const active = item.exact
                ? pathname === item.href
                : pathname.startsWith(item.href)
              const Icon = item.icon
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  className={`group relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] transition-all duration-150 ${
                    active
                      ? 'bg-primary/10 text-primary font-medium'
                      : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                  }`}
                >
                  {active && (
                    <span className="absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r-full bg-primary" />
                  )}
                  <Icon
                    className={`w-4 h-4 shrink-0 transition-transform duration-150 ${active ? '' : 'group-hover:scale-110'}`}
                    strokeWidth={1.75}
                  />
                  {t(item.key)}
                </Link>
              )
            })}
          </div>
        </div>
      ))}
    </nav>
  )
}

function SidebarFooter() {
  const t = useTranslations('nav')
  return (
    <div className="p-3 border-t border-sidebar-border space-y-3">
      <div className="flex items-center gap-2 rounded-lg bg-sidebar-accent/60 px-2.5 py-2">
        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-primary/30 to-accent/30 flex items-center justify-center text-[10px] font-bold text-primary shrink-0">
          CF
        </div>
        <span className="text-xs text-sidebar-foreground truncate">
          {t('workspace')}
        </span>
      </div>
      <div className="flex items-center justify-between gap-2 px-1">
        <LanguageSwitcher />
        <ThemeToggle />
      </div>
    </div>
  )
}

function Logo() {
  return (
    <Link href="/dashboard" className="flex items-center gap-2">
      <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-sm shadow-primary/20">
        <Film className="w-3.5 h-3.5 text-white" />
      </div>
      <span className="text-[13px] font-semibold text-sidebar-accent-foreground tracking-tight">
        ClipForge
      </span>
    </Link>
  )
}

export default function DashboardLayout({
  children
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const [drawerOpen, setDrawerOpen] = useState(false)

  // Close the mobile drawer on navigation
  useEffect(() => {
    setDrawerOpen(false)
  }, [pathname])

  return (
    <div className="flex min-h-dvh">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-56 shrink-0 border-r border-sidebar-border bg-sidebar flex-col sticky top-0 h-dvh">
        <div className="px-4 py-4">
          <Logo />
        </div>
        <SidebarNav />
        <SidebarFooter />
      </aside>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 bg-black/50 animate-fade-in"
            onClick={() => setDrawerOpen(false)}
          />
          <aside className="absolute left-0 top-0 h-full w-64 bg-sidebar border-r border-sidebar-border flex flex-col animate-slide-in-left">
            <div className="flex items-center justify-between px-4 py-4">
              <Logo />
              <button
                type="button"
                aria-label="Close menu"
                onClick={() => setDrawerOpen(false)}
                className="rounded-lg p-1.5 text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <SidebarNav onNavigate={() => setDrawerOpen(false)} />
            <SidebarFooter />
          </aside>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile top bar */}
        <header className="lg:hidden sticky top-0 z-40 flex items-center gap-3 border-b border-border bg-background/90 backdrop-blur-md px-4 py-3">
          <button
            type="button"
            aria-label="Open menu"
            onClick={() => setDrawerOpen(true)}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <Menu className="w-5 h-5" />
          </button>
          <Logo />
        </header>

        <main className="flex-1 overflow-y-auto">
          <div className="px-4 sm:px-6 py-6 mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  )
}
