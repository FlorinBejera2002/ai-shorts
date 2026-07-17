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
      color:
        'from-amber-500/10 to-amber-500/5 hover:from-amber-500/20 hover:to-amber-500/10'
    },
    {
      href: '/dashboard/create?mode=youtube',
      icon: Link2,
      label: t('youtubeUrl'),
      color:
        'from-red-500/10 to-red-500/5 hover:from-red-500/20 hover:to-red-500/10'
    },
    {
      href: '/dashboard/create?mode=batch',
      icon: Layers,
      label: t('batchProcess'),
      color:
        'from-violet-500/10 to-violet-500/5 hover:from-violet-500/20 hover:to-violet-500/10'
    }
  ]

  return (
    <div>
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {t('quickActions')}
      </h2>
      <div className="mt-4 grid grid-cols-3 gap-3 sm:gap-4">
        {actions.map(({ href, icon: Icon, label, color }, i) => (
          <Link
            key={href}
            href={href}
            className={`group relative flex flex-col items-center justify-center gap-2.5 rounded-xl border border-border/60 bg-gradient-to-br ${color} p-5 transition-all duration-300 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/10 active:scale-95 animate-slide-up`}
            style={{ animationDelay: `${i * 50}ms` }}
          >
            <div className="relative flex h-11 w-11 items-center justify-center rounded-lg bg-background/40 backdrop-blur-sm transition-all duration-300 group-hover:bg-background/60">
              <Icon
                className="h-5 w-5 text-primary transition-transform duration-300 group-hover:scale-110"
                strokeWidth={1.75}
              />
            </div>
            <span className="text-xs font-semibold text-foreground text-center leading-tight">
              {label}
            </span>
          </Link>
        ))}
      </div>
    </div>
  )
}
