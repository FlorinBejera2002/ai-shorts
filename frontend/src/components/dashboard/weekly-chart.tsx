import { useTranslations } from 'next-intl'

interface DayData {
  label: string
  count: number
}

export function WeeklyChart({ data }: { data: DayData[] }) {
  const t = useTranslations('dashboard')
  const max = Math.max(...data.map((d) => d.count), 1)

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {t('weeklyActivity')}
      </h2>
      <div className="mt-4 flex items-end gap-2 h-28">
        {data.map((day) => (
          <div key={day.label} className="flex-1 flex flex-col items-center gap-1">
            <span className="text-[10px] tabular-nums text-muted-foreground">
              {day.count > 0 ? day.count : ''}
            </span>
            <div
              className="w-full rounded-t bg-primary/80 transition-all"
              style={{
                height: `${Math.max((day.count / max) * 100, day.count > 0 ? 8 : 2)}%`,
                opacity: day.count > 0 ? 1 : 0.2,
              }}
            />
            <span className="text-[10px] text-muted-foreground">{day.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
