import { numberFormat } from '../lib/format'
import { Card } from './ui/card'

export type Stat = { label: string; value: number; alert?: boolean }

/** Row of plain number cards, shared by Overview, Billing and Errors. */
export function StatGrid({ stats, label }: { stats: Stat[]; label: string }) {
  return (
    <section className="metric-grid" aria-label={label}>
      {stats.map(({ label: name, value, alert }) => (
        <Card className="metric-card" key={name}>
          <span className="metric-label">{name}</span>
          <strong data-alert={alert || undefined}>{numberFormat.format(value)}</strong>
        </Card>
      ))}
    </section>
  )
}
