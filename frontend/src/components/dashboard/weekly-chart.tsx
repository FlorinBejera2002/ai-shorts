import { useTranslations } from 'next-intl'

interface DayData {
  label: string
  count: number
}

export function WeeklyChart({ data }: { data: DayData[] }) {
  const t = useTranslations('dashboard')
  const max = Math.max(...data.map((d) => d.count), 1)
  const today = new Date().toLocaleDateString('en', { weekday: 'short' })

  return (
    <div className="rounded-xl border border-border bg-card p-5 animate-fade-in">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {t('weeklyActivity')}
      </h2>
      <div className="mt-5 flex items-end justify-between gap-1 h-40">
        {data.map((day, i) => {
          const isToday = day.label === today
          const heightPercent = Math.max(
            (day.count / max) * 100,
            day.count > 0 ? 10 : 3
          )
          return (
            <div
              key={day.label}
              className="group flex flex-1 flex-col items-center gap-1.5"
              style={{
                animation: `slide-up 0.5s cubic-bezier(0.16, 1, 0.3, 1) ${i * 80}ms both`
              }}
            >
              {day.count > 0 && (
                <span className="text-[10px] font-semibold tabular-nums text-muted-foreground transition-all">
                  {day.count}
                </span>
              )}
              <div className="relative w-full">
                <div
                  className={`w-full rounded-t-lg transition-all duration-500 ${
                    isToday
                      ? 'bg-gradient-to-t from-primary to-primary/80 shadow-lg shadow-primary/20'
                      : 'bg-gradient-to-t from-primary/60 to-primary/40 hover:from-primary/80 hover:to-primary/60'
                  } ${day.count === 0 ? 'opacity-20' : 'opacity-100'}`}
                  style={{
                    height: `${heightPercent}%`,
                    transformOrigin: 'bottom',
                    cursor: 'pointer'
                  }}
                  title={`${day.label}: ${day.count} clips`}
                />
                {isToday && (
                  <div className="absolute -top-1.5 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-primary shadow-md" />
                )}
              </div>
              <span
                className={`text-[10px] font-medium transition-colors ${isToday ? 'text-primary font-semibold' : 'text-muted-foreground'}`}
              >
                {day.label}
              </span>
            </div>
          )
        })}
      </div>
      <p className="mt-4 text-[11px] text-muted-foreground text-center">
        Clips generated this week
      </p>
    </div>
  )
}
