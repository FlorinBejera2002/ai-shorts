'use client'

import { Link } from '@/i18n/navigation'
import { ArrowUpRight, Layers, Link2, Upload } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import styles from './studio-home.module.css'

export function QuickActions() {
  const t = useTranslations('dashboard')
  const ro = useLocale() === 'ro'
  const actions = [
    {
      href: '/dashboard/create?mode=upload',
      icon: Upload,
      label: t('uploadVideo'),
      description: ro
        ? 'Începe cu un fișier de pe dispozitiv'
        : 'Start with a file from your device'
    },
    {
      href: '/dashboard/create?mode=youtube',
      icon: Link2,
      label: t('youtubeUrl'),
      description: ro
        ? 'Importă un material prin link'
        : 'Bring in footage from a video link'
    },
    {
      href: '/dashboard/create?mode=batch',
      icon: Layers,
      label: t('batchProcess'),
      description: ro
        ? 'Procesează mai multe materiale'
        : 'Work through multiple source videos'
    }
  ]
  return (
    <nav aria-label={t('quickActions')} className={styles.actions}>
      {actions.map(({ href, icon: Icon, label, description }) => (
        <Link key={href} href={href} className={styles.action}>
          <span className={styles.actionIcon}>
            <Icon size={16} strokeWidth={1.6} />
          </span>
          <span className="min-w-0 flex-1">
            <span className={styles.actionLabel}>{label}</span>
            <span className={styles.actionDescription}>{description}</span>
          </span>
          <ArrowUpRight size={15} className="shrink-0 opacity-60" />
        </Link>
      ))}
    </nav>
  )
}
