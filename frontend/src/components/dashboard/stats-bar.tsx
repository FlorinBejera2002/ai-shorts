import { useAuth } from '@/components/auth/use-auth'
import { Link } from '@/i18n/navigation'
import { Clock3, Coins, Film, Layers } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import styles from './home-workspace.module.css'

interface StatsBarProps {
  credits: number
  creditsUnlimited?: boolean
  jobCount: number
  clipCount: number
  durationMinutes: number
}

export function StatsBar({
  credits,
  creditsUnlimited,
  jobCount,
  clipCount,
  durationMinutes
}: StatsBarProps) {
  const t = useTranslations('dashboard.studio')
  const design = useTranslations('dashboard.homeDesign')
  const billing = useTranslations('billing')
  const { user } = useAuth()
  const locale = useLocale()
  const unlimited = creditsUnlimited ?? user?.access_role === 'admin'
  const stats = [
    {
      id: 'clips',
      label: t('clips'),
      value: clipCount,
      icon: Film,
      href: '/dashboard/clips'
    },
    {
      id: 'projects',
      label: t('projects'),
      value: jobCount,
      icon: Layers,
      href: '/dashboard/clips'
    },
    {
      id: 'minutes',
      label: t('output'),
      value: durationMinutes,
      icon: Clock3,
      href: '/dashboard/clips'
    },
    {
      id: 'credits',
      label: t('credits'),
      value: unlimited ? '∞' : credits,
      icon: Coins,
      href: '/dashboard/billing'
    }
  ]
  return (
    <nav className={styles.stats} aria-label={design('statistics')}>
      {stats.map(({ id, label, value, icon: Icon, href }) => (
        <Link key={id} href={href} className={styles.stat} data-home-stat={id}>
          <span className={styles.statIcon}>
            <Icon aria-hidden="true" strokeWidth={1.6} />
          </span>
          <span className={styles.statCopy}>
            <span className={styles.statLabel}>{label}</span>
            <strong className={styles.statValue}>
              {typeof value === 'number' ? value.toLocaleString(locale) : value}
            </strong>
            {id === 'credits' && unlimited && <span className={styles.statHint}>{billing('creditsUnlimited')}</span>}
          </span>
        </Link>
      ))}
    </nav>
  )
}
