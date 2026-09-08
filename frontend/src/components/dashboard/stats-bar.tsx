import { Link } from '@/i18n/navigation'
import { Clock3, Film, FolderOpen, Zap } from 'lucide-react'
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
      href: '/dashboard/clips'
    },
    {
      label: t('projects'),
      value: jobCount,
      icon: FolderOpen,
      hint: t('projectsHint'),
      href: '/dashboard/history'
    },
    {
      label: t('output'),
      value: durationMinutes,
      icon: Clock3,
      hint: t('outputHint'),
      href: '/dashboard/history?tab=analytics'
    },
    {
      label: t('credits'),
      value: credits,
      icon: Zap,
      hint: t('creditsHint'),
      href: '/dashboard/billing'
    }
  ]
  return (
    <div className="grid grid-cols-2 overflow-hidden border-y bg-transparent xl:grid-cols-4">
      {stats.map(({ label, value, icon: Icon, hint, href }) => (
        <Link
          key={label}
          href={href}
          className="group min-w-0 rounded-none border-border py-5 px-4 transition-colors hover:bg-muted/40 focus-visible:-outline-offset-2 [&:nth-child(even)]:border-l [&:nth-child(n+3)]:border-t xl:px-5 xl:[&:nth-child(n+2)]:border-l xl:[&:nth-child(n+3)]:border-t-0"
        >
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-medium text-muted-foreground">
              {label}
            </span>
            <Icon
              className="size-4 shrink-0 text-muted-foreground/70"
              strokeWidth={1.5}
            />
          </div>
          <div className="mt-2 text-[1.9rem] font-medium leading-none tracking-tight tabular-nums">
            {value.toLocaleString(locale)}
          </div>
          <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>{hint}</span>
          </div>
        </Link>
      ))}
    </div>
  )
}
