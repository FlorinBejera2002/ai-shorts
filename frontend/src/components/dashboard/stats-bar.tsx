import { useTranslations } from 'next-intl'

interface StatsBarProps {
  credits: number
  jobCount: number
  clipCount: number
  plan: string
}

export function StatsBar({ credits, jobCount, clipCount, plan }: StatsBarProps) {
  const t = useTranslations('dashboard')
  const stats = [
    { label: t('creditsLabel'), value: credits },
    { label: t('jobsLabel'), value: jobCount },
    { label: t('clipsLabel'), value: clipCount },
    { label: t('planLabel'), value: plan, capitalize: true },
  ]

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-px rounded-xl bg-border overflow-hidden">
      {stats.map((stat, i) => (
        <div
          key={stat.label}
          className="bg-card px-5 py-4 animate-slide-up"
          style={{ animationDelay: `${i * 60}ms` }}
        >
          <div className="text-xs text-muted-foreground">{stat.label}</div>
          <div className={`mt-1 text-xl font-semibold tabular-nums ${stat.capitalize ? 'capitalize' : ''}`}>
            {stat.value}
          </div>
        </div>
      ))}
    </div>
  )
}
