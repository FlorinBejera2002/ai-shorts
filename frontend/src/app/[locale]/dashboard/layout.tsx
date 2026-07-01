'use client'

import {
  BarChart3,
  Clock,
  CreditCard,
  Film,
  LayoutDashboard,
  ListChecks,
  Palette,
  Settings,
  Share2,
  Sparkles
} from 'lucide-react'
import { Link, usePathname } from '@/i18n/navigation'

const nav = [
  { href: '/dashboard', label: 'Home', icon: LayoutDashboard, exact: true },
  { href: '/dashboard/create', label: 'Create', icon: Sparkles },
  { href: '/dashboard/review', label: 'Review', icon: ListChecks },
  { href: '/dashboard/clips', label: 'Clips', icon: Film },
  { href: '/dashboard/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/dashboard/brand', label: 'Brand Kit', icon: Palette },
  { href: '/dashboard/publish', label: 'Publish', icon: Share2 },
  { href: '/dashboard/history', label: 'History', icon: Clock },
  { href: '/dashboard/billing', label: 'Billing', icon: CreditCard },
  { href: '/dashboard/settings', label: 'Settings', icon: Settings }
]

export default function DashboardLayout({
  children
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()

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
          {nav.map((item) => {
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
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div className="p-3 border-t border-sidebar-border">
          <div className="flex items-center gap-2 px-2 py-1.5">
            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-primary/30 to-accent/30 flex items-center justify-center text-[10px] font-bold text-primary">
              CF
            </div>
            <span className="text-xs text-sidebar-foreground truncate">
              My workspace
            </span>
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <div className="px-6 py-6">{children}</div>
      </main>
    </div>
  )
}
