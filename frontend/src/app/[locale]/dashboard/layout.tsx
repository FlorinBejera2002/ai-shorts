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
import {
  AnimatePresence,
  motion,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useSpring
} from 'framer-motion'
import { useEffect, useState, type MouseEvent } from 'react'
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
    <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-7">
      {navGroups.map((group) => (
        <div key={group.labelKey}>
          <div className="px-3 pb-2 text-[9px] font-bold uppercase tracking-[0.24em] text-sidebar-foreground/45">
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
                  className={`group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] transition-colors duration-200 ${
                    active
                      ? 'text-sidebar-primary-foreground font-semibold'
                      : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                  }`}
                >
                  {active && (
                    <motion.span
                      layoutId={`active-nav-${onNavigate ? 'mobile' : 'desktop'}`}
                      className="absolute inset-0 rounded-lg bg-sidebar-primary"
                      transition={{ type: 'spring', stiffness: 420, damping: 34, mass: 0.8 }}
                    />
                  )}
                  <Icon
                    className={`relative z-10 w-4 h-4 shrink-0 transition-transform duration-300 ${active ? '' : 'group-hover:-rotate-6 group-hover:scale-110'}`}
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
    <div className="p-4 border-t border-sidebar-border space-y-3">
      <div className="flex items-center gap-2 rounded-xl border border-sidebar-border bg-sidebar-accent/60 px-3 py-2.5">
        <div className="w-7 h-7 rounded-lg bg-sidebar-primary flex items-center justify-center text-[9px] font-black text-sidebar-primary-foreground shrink-0">
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
      <div className="relative w-8 h-8 rounded-lg border border-sidebar-border bg-sidebar-accent flex items-center justify-center">
        <Film className="w-4 h-4 text-sidebar-primary-foreground" />
      </div>
      <span className="font-serif text-[17px] font-semibold text-sidebar-accent-foreground tracking-tight">
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
  const reduceMotion = useReducedMotion()
  const pointerX = useMotionValue(0)
  const pointerY = useMotionValue(0)
  const smoothX = useSpring(pointerX, { stiffness: 120, damping: 24, mass: 0.4 })
  const smoothY = useSpring(pointerY, { stiffness: 120, damping: 24, mass: 0.4 })
  const spotlight = useMotionTemplate`radial-gradient(520px circle at ${smoothX}px ${smoothY}px, color-mix(in srgb, var(--primary) 7%, transparent), transparent 72%)`

  const trackPointer = (event: MouseEvent<HTMLElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect()
    pointerX.set(event.clientX - bounds.left)
    pointerY.set(event.clientY - bounds.top + event.currentTarget.scrollTop)
  }

  // Close the mobile drawer on navigation
  useEffect(() => {
    setDrawerOpen(false)
  }, [pathname])

  return (
    <div className="flex min-h-dvh bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-64 shrink-0 border-r border-sidebar-border bg-sidebar flex-col sticky top-0 h-dvh shadow-2xl shadow-black/10">
        <div className="px-5 py-6">
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

        <main className="relative flex-1 overflow-y-auto" onMouseMove={trackPointer}>
          {!reduceMotion && <motion.div className="pointer-events-none absolute inset-0" style={{ background: spotlight }} />}
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={pathname}
              initial={reduceMotion ? false : { opacity: 0, y: 12, filter: 'blur(5px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={reduceMotion ? undefined : { opacity: 0, y: -7, filter: 'blur(3px)' }}
              transition={{ duration: 0.48, ease: [0.16, 1, 0.3, 1] }}
              className="relative mx-auto w-full max-w-[1380px] px-4 py-7 sm:px-8 sm:py-9"
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  )
}
