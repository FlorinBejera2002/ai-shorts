import { Card, CardContent } from '@/components/ui/card'
import { Link } from '@/i18n/navigation'
import { ArrowUpRight, Clock3, Film, FolderOpen, Zap } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'

export function StatsBar({
  credits,
  jobCount,
  clipCount,
  durationMinutes
}: {
  credits: number
  jobCount: number
  clipCount: number
  durationMinutes: number
}) {
  const t = useTranslations('dashboard.studio')
  const locale = useLocale()
  const stats = [
    {
      label: t('clips'),
      value: clipCount,
      icon: Film,
      hint: t('clipsHint'),
      href: '/dashboard/clips',
      color: 'text-primary bg-primary/10'
    },
    {
      label: t('projects'),
      value: jobCount,
      icon: FolderOpen,
      hint: t('projectsHint'),
      href: '/dashboard/history',
      color: 'text-sky-600 bg-sky-500/10 dark:text-sky-400'
    },
    {
      label: t('output'),
      value: durationMinutes,
      icon: Clock3,
      hint: t('outputHint'),
      href: '/dashboard/analytics',
      color: 'text-violet-600 bg-violet-500/10 dark:text-violet-400'
    },
    {
      label: t('credits'),
      value: credits,
      icon: Zap,
      hint: t('creditsHint'),
      href: '/dashboard/billing',
      color: 'text-amber-700 bg-amber-500/10 dark:text-amber-400'
    }
  ]
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
      {stats.map(({ label, value, icon: Icon, hint, href, color }) => (
        <Card
          key={label}
          className="group relative gap-0 overflow-hidden py-5 shadow-none transition-colors hover:border-primary/40"
        >
          <CardContent className="px-5">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-medium text-muted-foreground">
                {label}
              </span>
              <span
                className={`flex size-8 items-center justify-center rounded-lg ${color}`}
              >
                <Icon className="size-4" strokeWidth={1.75} />
              </span>
            </div>
            <div className="mt-3 text-[2rem] font-semibold leading-none tracking-tight tabular-nums">
              {value.toLocaleString(locale)}
            </div>
            <Link
              href={href}
              className="mt-4 flex items-center justify-between gap-2 text-xs text-muted-foreground after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring focus-visible:after:rounded-xl"
            >
              <span>{hint}</span>
              <ArrowUpRight className="size-3.5 shrink-0 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </Link>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
