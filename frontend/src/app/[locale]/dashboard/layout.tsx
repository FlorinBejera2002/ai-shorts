'use client'

import {
  BarChart3,
  Clock,
  CreditCard,
  FileText,
  Film,
  LayoutDashboard,
  ListChecks,
  Palette,
  Settings,
  Share2,
  Sparkles
} from 'lucide-react'
import { Link, usePathname } from '@/i18n/navigation'
import { useTranslations } from 'next-intl'
import { LanguageSwitcher } from '@/components/shared/language-switcher'
import { ThemeToggle } from '@/components/shared/theme-toggle'

const navKeys = [
  { href: '/dashboard', key: 'home', icon: LayoutDashboard, exact: true },
  { href: '/dashboard/create', key: 'create', icon: Sparkles },
  { href: '/dashboard/review', key: 'review', icon: ListChecks },
  { href: '/dashboard/clips', key: 'clips', icon: Film },
  { href: '/dashboard/analytics', key: 'analytics', icon: BarChart3 },
  { href: '/dashboard/script-generator', key: 'scripts', icon: FileText },
  { href: '/dashboard/brand', key: 'brand', icon: Palette },
  { href: '/dashboard/publish', key: 'publish', icon: Share2 },
  { href: '/dashboard/history', key: 'history', icon: Clock },
  { href: '/dashboard/billing', key: 'billing', icon: CreditCard },
  { href: '/dashboard/settings', key: 'settings', icon: Settings }
]

export default function DashboardLayout({
  children
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const t = useTranslations('nav')

  return (
    <div className="flex min-h-dvh">
      <aside className="w-52 shrink-0 border-r border-sidebar-border bg-sidebar flex flex-col">
        <div className="px-4 py-4">
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
              <Film className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="text-[13px] font-semibold text-sidebar-accent-foreground tracking-tight">
              ClipForge
            </span>
          </Link>
        </div>

        <nav className="flex-1 px-2 space-y-0.5">
          {navKeys.map((item) => {
            const active = item.exact
              ? pathname === item.href
              : pathname.startsWith(item.href)
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] transition-all duration-150 ${
                  active
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" strokeWidth={1.75} />
                {t(item.key)}
              </Link>
            )
          })}
        </nav>

        <div className="p-3 border-t border-sidebar-border space-y-3">
          <div className="flex items-center gap-2 px-2 py-1.5">
            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-primary/30 to-accent/30 flex items-center justify-center text-[10px] font-bold text-primary">
              CF
            </div>
            <span className="text-xs text-sidebar-foreground truncate">
              {t('workspace')}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2 px-2">
            <LanguageSwitcher />
            <ThemeToggle />
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <div className="px-6 py-6">{children}</div>
      </main>
    </div>
  )
}
