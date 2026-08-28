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
            className="group relative overflow-hidden rounded-xl border border-border bg-card/90 p-5 transition-all duration-500 hover:-translate-y-1 hover:border-foreground/20 hover:shadow-[0_18px_45px_rgba(0,0,0,.07)] animate-slide-up"
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <div className="flex items-start justify-between">
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-bold uppercase tracking-[.18em] text-muted-foreground">
                  {stat.label}
                </div>
                <div
                  className={`mt-3 font-serif text-3xl font-semibold tabular-nums ${stat.capitalize ? 'capitalize' : ''}`}
                >
                  {stat.value}
                </div>
              </div>
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/50 text-muted-foreground transition-all duration-500 group-hover:-rotate-6 group-hover:border-primary/30 group-hover:text-primary"
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
