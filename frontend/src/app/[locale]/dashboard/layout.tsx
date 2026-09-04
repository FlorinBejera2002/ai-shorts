'use client'

import { BrandLogo } from '@/components/shared/brand-logo'
import { LanguageSwitcher } from '@/components/shared/language-switcher'
import { ThemeToggle } from '@/components/shared/theme-toggle'
import { Link, usePathname } from '@/i18n/navigation'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  BarChart3,
  CalendarDays,
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
import { useEffect, useRef, useState } from 'react'

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
      { href: '/dashboard/calendar', key: 'calendar', icon: CalendarDays },
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
    <nav className="flex-1 space-y-6 overflow-y-auto px-4 py-5">
      {navGroups.map((group) => (
        <div key={group.labelKey}>
          <div className="px-3 pb-2 text-[9px] font-bold uppercase tracking-[0.22em] text-sidebar-foreground">
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
                  aria-current={active ? 'page' : undefined}
                  className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] transition-colors duration-200 ${
                    active
                      ? 'text-sidebar-primary-foreground font-semibold'
                      : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                  }`}
                >
                  {active && (
                    <motion.span
                      layoutId={`active-nav-${onNavigate ? 'mobile' : 'desktop'}`}
                      className="absolute inset-0 rounded-xl bg-sidebar-primary ring-1 ring-sidebar-ring/10"
                      transition={{
                        type: 'spring',
                        stiffness: 420,
                        damping: 34,
                        mass: 0.8
                      }}
                    />
                  )}
                  <Icon
                    className={`relative z-10 h-4 w-4 shrink-0 transition-transform duration-200 ${active ? '' : 'group-hover:translate-x-0.5'}`}
                    strokeWidth={1.75}
                  />
                  <span className="relative z-10">{t(item.key)}</span>
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
    <div className="space-y-3 border-t border-sidebar-border p-4">
      <div className="flex items-center gap-2.5 rounded-xl border border-sidebar-border bg-sidebar-accent/70 px-3 py-2.5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-[9px] font-black text-primary-foreground shadow-sm">
          SC
        </div>
        <span className="truncate text-xs font-medium text-sidebar-accent-foreground">
          {t('workspace')}
        </span>
      </div>
      <div className="flex items-center justify-between gap-2">
        <LanguageSwitcher placement="top" />
        <ThemeToggle />
      </div>
    </div>
  )
}

function Logo() {
  return (
    <Link href="/dashboard" className="flex items-center">
      <BrandLogo onDark={true} priority={true} />
    </Link>
  )
}

export default function DashboardLayout({
  children
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const t = useTranslations('nav')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const reduceMotion = useReducedMotion()
  const drawerRef = useRef<HTMLElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const menuButtonRef = useRef<HTMLButtonElement>(null)

  // Close the mobile drawer on navigation
  useEffect(() => {
    if (pathname) setDrawerOpen(false)
  }, [pathname])

  useEffect(() => {
    if (!drawerOpen) return

    const previousFocus = document.activeElement as HTMLElement | null
    const main = document.getElementById('dashboard-main')
    const previousOverflow = document.body.style.overflow
    main?.setAttribute('inert', '')
    document.body.style.overflow = 'hidden'

    const focusFrame = requestAnimationFrame(() => {
      closeButtonRef.current?.focus()
    })

    function handleDrawerKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        setDrawerOpen(false)
        return
      }

      if (event.key !== 'Tab' || !drawerRef.current) return

      const focusable = Array.from(
        drawerRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      ).filter((element) => !element.hasAttribute('hidden'))

      const first = focusable[0]
      const last = focusable.at(-1)
      if (!first || !last) return

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleDrawerKeyDown)
    return () => {
      cancelAnimationFrame(focusFrame)
      document.removeEventListener('keydown', handleDrawerKeyDown)
      main?.removeAttribute('inert')
      document.body.style.overflow = previousOverflow
      const focusTarget = previousFocus ?? menuButtonRef.current
      focusTarget?.focus()
    }
  }, [drawerOpen])

  return (
    <div
      id="dashboard-shell"
      className="flex min-h-dvh bg-background text-foreground"
    >
      <a
        href="#dashboard-main"
        className="fixed left-4 top-3 z-[100] -translate-y-20 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground shadow-lg transition-transform focus:translate-y-0"
      >
        {t('skipContent')}
      </a>
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-[17rem] shrink-0 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
        <div className="flex h-20 items-center border-b border-sidebar-border px-5">
          <Logo />
        </div>
        <SidebarNav />
        <SidebarFooter />
      </aside>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-black/50 animate-fade-in"
            onClick={() => setDrawerOpen(false)}
          />
          <aside
            ref={drawerRef}
            id="dashboard-mobile-navigation"
            role="dialog"
            aria-modal="true"
            aria-label={t('mobileNavigation')}
            className="absolute left-0 top-0 flex h-full w-[min(17rem,calc(100vw-2rem))] flex-col border-r border-sidebar-border bg-sidebar shadow-2xl animate-slide-in-left"
          >
            <div className="flex h-20 items-center justify-between border-b border-sidebar-border px-4">
              <Logo />
              <button
                ref={closeButtonRef}
                type="button"
                aria-label={t('closeMenu')}
                onClick={() => setDrawerOpen(false)}
                className="rounded-lg p-2 text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <SidebarNav onNavigate={() => setDrawerOpen(false)} />
            <SidebarFooter />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-40 flex h-16 items-center gap-3 border-b border-border bg-background/90 px-4 shadow-sm backdrop-blur-xl lg:hidden">
          <button
            ref={menuButtonRef}
            type="button"
            aria-label={t('openMenu')}
            aria-expanded={drawerOpen}
            aria-controls="dashboard-mobile-navigation"
            onClick={() => setDrawerOpen(true)}
            className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Menu className="w-5 h-5" />
          </button>
          <Logo />
        </header>

        <main
          id="dashboard-main"
          tabIndex={-1}
          className="relative flex-1 overflow-y-auto"
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={pathname}
              initial={
                reduceMotion
                  ? false
                  : { opacity: 0, y: 12, filter: 'blur(5px)' }
              }
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={
                reduceMotion
                  ? undefined
                  : { opacity: 0, y: -7, filter: 'blur(3px)' }
              }
              transition={{ duration: 0.48, ease: [0.16, 1, 0.3, 1] }}
              className="page-shell relative py-6 sm:py-8 lg:py-10"
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  )
}
