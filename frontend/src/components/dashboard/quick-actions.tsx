'use client'

import { Link } from '@/i18n/navigation'
import { Layers, Link2, Upload } from 'lucide-react'
import { useTranslations } from 'next-intl'

export function QuickActions() {
  const t = useTranslations('dashboard')
  const actions = [
    {
      href: '/dashboard/create?mode=upload',
      icon: Upload,
      label: t('uploadVideo'),
      color: 'bg-card hover:bg-card'
    },
    {
      href: '/dashboard/create?mode=youtube',
      icon: Link2,
      label: t('youtubeUrl'),
      color: 'bg-card hover:bg-card'
    },
    {
      href: '/dashboard/create?mode=batch',
      icon: Layers,
      label: t('batchProcess'),
      color: 'bg-card hover:bg-card'
    }
  ]

  return (
    <div>
      <h2 className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.2em] text-muted-foreground before:h-px before:w-8 before:bg-accent">
        {t('quickActions')}
      </h2>
      <div className="mt-4 grid grid-cols-3 gap-3 sm:gap-4">
        {actions.map(({ href, icon: Icon, label, color }, i) => (
          <Link
            key={href}
            href={href}
            className={`group relative flex min-h-32 flex-col items-start justify-between gap-4 overflow-hidden rounded-xl border border-border/70 ${color} p-5 transition-all duration-500 hover:-translate-y-1 hover:border-foreground/20 hover:shadow-[0_20px_50px_rgba(0,0,0,.08)] active:scale-[.98] animate-slide-up`}
            style={{ animationDelay: `${i * 50}ms` }}
          >
            <div className="relative flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-muted/50 text-foreground transition-all duration-500 group-hover:rotate-[8deg] group-hover:border-primary/30 group-hover:bg-primary/10 group-hover:text-primary">
              <Icon
                className="h-5 w-5 transition-transform duration-300 group-hover:scale-110"
                strokeWidth={1.75}
              />
            </div>
            <span className="font-serif text-base font-semibold text-foreground text-left leading-tight">
              {label}
            </span>
          </Link>
        ))}
      </div>
    </div>
  )
}
