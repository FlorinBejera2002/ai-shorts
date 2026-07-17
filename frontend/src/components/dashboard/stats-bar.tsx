import { BookOpen, Crown, Film, Zap } from 'lucide-react'
import { useTranslations } from 'next-intl'

interface StatsBarProps {
  credits: number
  jobCount: number
  clipCount: number
  plan: string
}

export function StatsBar({
  credits,
  jobCount,
  clipCount,
  plan
}: StatsBarProps) {
  const t = useTranslations('dashboard')
  const stats = [
    {
      label: t('creditsLabel'),
      value: credits,
      icon: Zap,
      color: 'text-amber-500'
    },
    {
      label: t('jobsLabel'),
      value: jobCount,
      icon: BookOpen,
      color: 'text-blue-500'
    },
    {
      label: t('clipsLabel'),
      value: clipCount,
      icon: Film,
      color: 'text-violet-500'
    },
    {
      label: t('planLabel'),
      value: plan,
      icon: Crown,
      color: 'text-emerald-500',
      capitalize: true
    }
  ]

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {stats.map((stat, i) => {
        const Icon = stat.icon
        return (
          <div
            key={stat.label}
            className="group rounded-xl border border-border bg-card p-4 transition-all duration-300 hover:border-primary/40 hover:shadow-md hover:shadow-primary/5 hover:-translate-y-1 animate-slide-up"
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <div className="flex items-start justify-between">
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  {stat.label}
                </div>
                <div
                  className={`mt-2 text-2xl font-bold tabular-nums ${stat.capitalize ? 'capitalize' : ''}`}
                >
                  {stat.value}
                </div>
              </div>
              <div
                className={`flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary/10 to-accent/10 ${stat.color} shrink-0 opacity-70 transition-opacity group-hover:opacity-100`}
              >
                <Icon className="h-4 w-4 strokeWidth={1.75}" />
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
