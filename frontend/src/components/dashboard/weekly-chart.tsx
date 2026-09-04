import { useTranslations } from 'next-intl'

interface DayData {
  label: string
  count: number
}

export function WeeklyChart({
  data,
  todayLabel
}: {
  data: DayData[]
  todayLabel: string
}) {
  const t = useTranslations('dashboard')
  const max = Math.max(...data.map((d) => d.count), 1)

  return (
    <div className="panel p-5 animate-fade-in">
      <h2 className="section-label">{t('weeklyActivity')}</h2>
      <div className="mt-5 flex h-36 items-end justify-between gap-1.5">
        {data.map((day, i) => {
          const isToday = day.label === todayLabel
          const heightPercent = Math.max(
            (day.count / max) * 100,
            day.count > 0 ? 10 : 3
          )
          return (
            <div
              key={day.label}
              className="group flex h-full flex-1 flex-col items-center gap-1.5"
              style={{
                animation: `slide-up 0.5s cubic-bezier(0.16, 1, 0.3, 1) ${i * 80}ms both`
              }}
            >
              <span
                className={`h-4 text-[10px] font-medium tabular-nums text-muted-foreground ${day.count === 0 ? 'invisible' : ''}`}
              >
                {day.count}
              </span>
              <div className="relative min-h-0 w-full flex-1">
                <div
                  className={`absolute inset-x-0 bottom-0 w-full rounded-t transition-all duration-500 ${
                    isToday ? 'bg-primary' : 'bg-primary/25 hover:bg-primary/45'
                  } ${day.count === 0 ? 'opacity-20' : ''}`}
                  style={{
                    height: `${heightPercent}%`,
                    transformOrigin: 'bottom'
                  }}
                  title={`${day.label}: ${day.count} ${t('clipsLabel').toLowerCase()}`}
                />
              </div>
              <span
                className={`text-[10px] font-medium ${isToday ? 'text-primary' : 'text-muted-foreground'}`}
              >
                {day.label}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
