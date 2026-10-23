import { RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'
import { BillingEventsPanel } from './billing-events'
import { BillingOverviewCards } from './billing-overview'
import { BillingError, BillingLoading } from './billing-shared'
import { BillingSubscriptionsPanel } from './billing-subscriptions'
import type { BillingOverview } from './types'
import { useBillingQuery } from './use-billing-query'
import './billing.css'

export function BillingPage() {
  const [revision, setRevision] = useState(0)
  const state = useBillingQuery<BillingOverview>('/api/admin/billing/overview', revision)
  const reload = () => setRevision((value) => value + 1)
  return <div className="page-content billing-page">
    <div className="billing-page-heading"><div><p className="eyebrow">Plăți și abonamente</p><h2>Facturare Stripe</h2><p>Vizibilitate asupra accesului, creditelor și procesării plăților. Datele sunt citite din starea salvată a platformei.</p></div><Button variant="outline" onClick={reload} disabled={state.loading}><RefreshCw aria-hidden="true" size={16} /> Actualizează datele</Button></div>
    {state.data?.configuration.mode === 'test' && <div className="billing-test-notice" role="note"><strong>Mod test Stripe activ</strong><p>Plățile și abonamentele din acest mediu sunt simulate. Nu se încasează bani reali. Folosește exclusiv carduri de test Stripe.</p></div>}
    {state.loading ? <Card><BillingLoading /></Card> : state.error ? <Card><BillingError message={state.error} retry={reload} /></Card> : state.data && <BillingOverviewCards overview={state.data} />}
    <BillingSubscriptionsPanel configuration={state.data?.configuration ?? null} revision={revision} />
    <BillingEventsPanel configuration={state.data?.configuration ?? null} revision={revision} />
  </div>
}
