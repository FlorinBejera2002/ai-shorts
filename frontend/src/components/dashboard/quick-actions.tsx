'use client'

import { Link } from '@/i18n/navigation'
import { ArrowUpRight, Layers, Link2, Upload } from 'lucide-react'
import { useTranslations } from 'next-intl'

export function QuickActions() {
  const t = useTranslations('dashboard')
  const actions = [
    {
      href: '/dashboard/create?mode=upload',
      icon: Upload,
      label: t('uploadVideo')
    },
    {
      href: '/dashboard/create?mode=youtube',
      icon: Link2,
      label: t('youtubeUrl')
    },
    {
      href: '/dashboard/create?mode=batch',
      icon: Layers,
      label: t('batchProcess')
    }
  ]

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {actions.map(({ href, icon: Icon, label }) => (
        <Link
          key={href}
          href={href}
          className="panel-soft group flex items-center gap-3 px-4 py-3 text-[13px] font-semibold text-foreground transition-all duration-200 hover:border-primary/35 hover:bg-primary/[0.06] active:scale-[.98]"
        >
          <span className="icon-tile h-8 w-8 rounded-lg">
            <Icon className="h-4 w-4" strokeWidth={1.75} />
          </span>
          <span className="min-w-0 flex-1 truncate">{label}</span>
          <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary" />
        </Link>
      ))}
    </div>
  )
}
