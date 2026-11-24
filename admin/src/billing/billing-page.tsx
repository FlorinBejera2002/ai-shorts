import { RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { Badge } from '../components/ui/badge'
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
    <div className="billing-page-actions">
      {state.data?.configuration.mode === 'test' && <Badge variant="outline" role="note">Mod test Stripe activ</Badge>}
      <Button variant="secondary" size="sm" className="ml-auto" onClick={reload} disabled={state.loading}><RefreshCw aria-hidden="true" /> Actualizează datele</Button>
    </div>
    {state.loading ? <Card><BillingLoading /></Card> : state.error ? <Card><BillingError message={state.error} retry={reload} /></Card> : state.data && <BillingOverviewCards overview={state.data} />}
    <BillingSubscriptionsPanel configuration={state.data?.configuration ?? null} revision={revision} />
    <BillingEventsPanel configuration={state.data?.configuration ?? null} revision={revision} />
  </div>
}
