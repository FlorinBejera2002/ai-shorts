import { useEffect, useState } from 'react'
import { api } from '../api'
import { type Stat, StatGrid } from '../components/stat-grid'
import { PageLoader, StatePanel } from '../components/state-panel'
import { Card } from '../components/ui/card'
import { numberFormat } from '../lib/format'

type Overview = {
  usersTotal: number
  usersActive: number
  usersSuspended: number
  newUsersSevenDays: number
  jobsTotal: number
  jobsActive: number
  jobsFailed: number
  clipsTotal: number
  creditsOutstanding: number
}

export function OverviewPage() {
  const [data, setData] = useState<Overview | null>(null)
  const [error, setError] = useState('')
  useEffect(() => { void api.request<Overview>('/api/admin/overview').then(setData).catch((e: Error) => setError(e.message)) }, [])

  if (error) return <div className="page-content"><Card><StatePanel illustration="loadError" title="Nu am putut încărca datele" message={error} role="alert" /></Card></div>
  if (!data) return <div className="page-content"><PageLoader /></div>

  const platform: Stat[] = [
    { label: 'Utilizatori', value: data.usersTotal },
    { label: 'Joburi active', value: data.jobsActive },
    { label: 'Clipuri', value: data.clipsTotal },
    { label: 'Credite', value: data.creditsOutstanding }
  ]
  const health: Stat[] = [
    { label: 'Conturi noi (7 zile)', value: data.newUsersSevenDays },
    { label: 'Conturi suspendate', value: data.usersSuspended, alert: data.usersSuspended > 0 },
    { label: 'Joburi eșuate', value: data.jobsFailed, alert: data.jobsFailed > 0 }
  ]

  return (
    <div className="page-content stack">
      <StatGrid stats={platform} label="Platformă" />
      <Card className="panel">
        <h2>Stare</h2>
        <dl className="value-list">
          {health.map(({ label, value, alert }) => <div key={label}><dt>{label}</dt><dd data-alert={alert || undefined}>{numberFormat.format(value)}</dd></div>)}
        </dl>
      </Card>
    </div>
  )
}
