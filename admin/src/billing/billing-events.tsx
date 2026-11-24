import { useState } from 'react'
import { StatePanel } from '../components/state-panel'
import { Card } from '../components/ui/card'
import { Table, TableBody, TableCell, TableColumns, TableRow } from '../components/ui/table'
import { BillingError, BillingLoading, BillingSectionHeading, StripeObjectLink } from './billing-shared'
import { billingDate } from './formatters'
import type { BillingConfiguration, BillingEvents } from './types'
import { useBillingQuery } from './use-billing-query'

export function BillingEventsPanel({ configuration, revision }: { configuration: BillingConfiguration | null; revision: number }) {
  const [retry, setRetry] = useState(0)
  const state = useBillingQuery<BillingEvents>('/api/admin/billing/events?limit=25', revision + retry)
  const items = state.data?.items ?? []
  return <section aria-labelledby="billing-events-heading">
    <BillingSectionHeading id="billing-events-heading" title="Ultimele evenimente procesate" />
    <Card className="table-panel" aria-busy={state.loading}>
      {state.loading ? <BillingLoading>Se încarcă evenimentele…</BillingLoading>
        : state.error ? <BillingError message={state.error} retry={() => setRetry((value) => value + 1)} />
        : items.length === 0 ? <StatePanel compact illustration="billingEmpty" title="Nu există evenimente Stripe procesate." />
        : <Table className="billing-events-table"><TableColumns columns={['Eveniment', 'Tip', 'Procesat']} />
          <TableBody>{items.map((event) => <TableRow key={event.id}><TableCell><StripeObjectLink configuration={configuration} resource="events" id={event.id} /></TableCell><TableCell><code>{event.type}</code></TableCell><TableCell>{billingDate(event.processedAt)}</TableCell></TableRow>)}</TableBody>
        </Table>}
    </Card>
  </section>
}
