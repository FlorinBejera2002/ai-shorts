import { useState } from 'react'
import { Card } from '../components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table'
import { BillingError, BillingLoading, StripeObjectLink } from './billing-shared'
import { billingDate } from './formatters'
import type { BillingConfiguration, BillingEvents } from './types'
import { useBillingQuery } from './use-billing-query'

export function BillingEventsPanel({ configuration, revision }: { configuration: BillingConfiguration | null; revision: number }) {
  const [retry, setRetry] = useState(0)
  const state = useBillingQuery<BillingEvents>('/api/admin/billing/events?limit=25', revision + retry)
  return <section aria-labelledby="billing-events-heading">
    <div className="billing-section-heading"><div><h2 id="billing-events-heading">Ultimele evenimente procesate</h2><p>Jurnalul local include doar evenimentele procesate. Pentru livrări eșuate sau evenimente neprimite, verifică Stripe Dashboard.</p></div></div>
    <Card className="table-panel" aria-busy={state.loading}>
      {state.loading ? <BillingLoading>Se încarcă evenimentele…</BillingLoading> : state.error ? <BillingError message={state.error} retry={() => setRetry((value) => value + 1)} /> : <Table className="billing-events-table"><TableHeader><TableRow><TableHead>Eveniment</TableHead><TableHead>Tip</TableHead><TableHead>Procesat la</TableHead><TableHead>Alocare de credite</TableHead></TableRow></TableHeader>
        <TableBody>{state.data?.items.length ? state.data.items.map((event) => <TableRow key={event.id}><TableCell><StripeObjectLink configuration={configuration} resource="events" id={event.id} /></TableCell><TableCell><code>{event.type}</code></TableCell><TableCell>{billingDate(event.processedAt)}</TableCell><TableCell>{event.creditGrantId ? <code className="billing-grant-id">{event.creditGrantId}</code> : 'Fără alocare'}</TableCell></TableRow>) : <TableRow><TableCell colSpan={4} className="h-32 text-center text-muted-foreground">Nu există evenimente Stripe procesate.</TableCell></TableRow>}</TableBody>
      </Table>}
    </Card>
  </section>
}
