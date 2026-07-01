'use client'

import { Upload, Link2, Layers } from 'lucide-react'
import { Link } from '@/i18n/navigation'
import { useTranslations } from 'next-intl'

export function QuickActions() {
  const t = useTranslations('dashboard')
  const actions = [
    { href: '/dashboard/create?mode=upload', icon: Upload, label: t('uploadVideo') },
    { href: '/dashboard/create?mode=youtube', icon: Link2, label: t('youtubeUrl') },
    { href: '/dashboard/create?mode=batch', icon: Layers, label: t('batchProcess') },
  ]

  return (
    <div>
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {t('quickActions')}
      </h2>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {actions.map(({ href, icon: Icon, label }) => (
          <Link
            key={href}
            href={href}
            className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card p-4 text-center transition-all hover:border-primary/40 hover:shadow-md hover:shadow-primary/5"
          >
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Icon className="w-4.5 h-4.5 text-primary" />
            </div>
            <span className="text-xs font-medium">{label}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}
