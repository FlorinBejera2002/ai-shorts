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
      color: 'text-primary'
    },
    {
      label: t('clipsLabel'),
      value: clipCount,
      icon: Film,
      color: 'text-sky-500'
    },
    {
      label: t('planLabel'),
      value: plan,
      icon: Crown,
      color: 'text-indigo-500',
      capitalize: true
    }
  ]

  return (
    <div className="grid grid-cols-2 gap-3 animate-fade-in xl:grid-cols-4">
      {stats.map((stat) => {
        const Icon = stat.icon
        return (
          <div
            key={stat.label}
            className="panel-soft flex min-w-0 items-center gap-3 px-4 py-4"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-card shadow-sm ring-1 ring-border">
              <Icon className={`h-4 w-4 ${stat.color}`} strokeWidth={1.75} />
            </div>
            <div className="min-w-0">
              <div className="section-label truncate text-[9px]">
                {stat.label}
              </div>
              <div
                className={`mt-1 text-xl font-semibold tabular-nums leading-tight ${stat.capitalize ? 'capitalize' : ''}`}
              >
                {stat.value}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
