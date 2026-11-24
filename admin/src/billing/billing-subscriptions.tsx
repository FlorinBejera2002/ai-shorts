import { useState } from 'react'
import { Pagination } from '../components/pagination'
import { SearchField } from '../components/search-field'
import { StatePanel } from '../components/state-panel'
import { Card } from '../components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select'
import { Table, TableBody, TableCell, TableColumns, TableRow } from '../components/ui/table'
import { BillingError, BillingLoading, BillingSectionHeading, BillingStatus, StripeObjectLink } from './billing-shared'
import { billingDate, billingNumber, statusLabel } from './formatters'
import type { BillingConfiguration, BillingSubscription, BillingSubscriptions } from './types'
import { useBillingQuery } from './use-billing-query'

const pageSize = 25
const statuses = ['active', 'trialing', 'past_due', 'unpaid', 'incomplete', 'incomplete_expired', 'paused', 'canceled', 'none']
const plans = ['free', 'creator', 'pro', 'agency']

export function BillingSubscriptionsPanel({ configuration, revision }: { configuration: BillingConfiguration | null; revision: number }) {
  const [filters, setFilters] = useState({ query: '', status: 'all', plan: 'all', page: 1 })
  const [retry, setRetry] = useState(0)
  const params = new URLSearchParams({ page: String(filters.page), pageSize: String(pageSize) })
  if (filters.query.trim()) params.set('q', filters.query.trim())
  if (filters.status !== 'all') params.set('status', filters.status)
  if (filters.plan !== 'all') params.set('plan', filters.plan)
  const state = useBillingQuery<BillingSubscriptions>(`/api/admin/billing/subscriptions?${params}`, revision + retry, 220)
  const { data } = state
  return <section aria-labelledby="billing-subscriptions-heading">
    <BillingSectionHeading id="billing-subscriptions-heading" title="Conturi și abonamente" />
    <div className="toolbar">
      <SearchField label="Caută profiluri Stripe" value={filters.query} onChange={(query) => setFilters({ ...filters, query, page: 1 })} />
      <Select value={filters.status} onValueChange={(status) => setFilters({ ...filters, status, page: 1 })}><SelectTrigger className="w-full sm:w-44" aria-label="Starea abonamentului"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Toate stările</SelectItem>{statuses.map((status) => <SelectItem value={status} key={status}>{statusLabel(status)}</SelectItem>)}</SelectContent></Select>
      <Select value={filters.plan} onValueChange={(plan) => setFilters({ ...filters, plan, page: 1 })}><SelectTrigger className="w-full sm:w-40" aria-label="Planul efectiv"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Toate planurile</SelectItem>{plans.map((plan) => <SelectItem key={plan} value={plan}>{plan.charAt(0).toUpperCase() + plan.slice(1)}</SelectItem>)}</SelectContent></Select>
    </div>
    <Card className="table-panel" aria-busy={state.loading}>
      {state.loading ? <BillingLoading /> : state.error ? <BillingError message={state.error} retry={() => setRetry((value) => value + 1)} /> : data && <>
        {data.items.length === 0 ? <StatePanel compact illustration="usersNoResults" title="Niciun profil Stripe găsit pentru aceste filtre." /> : <Table className="billing-subscriptions-table">
          <TableColumns columns={['Utilizator', 'Plan', 'Perioadă', 'Credite', 'Stripe']} />
          <TableBody>{data.items.map((item) => <SubscriptionRow key={item.id} item={item} configuration={configuration} />)}</TableBody>
        </Table>}
        <Pagination page={filters.page} total={data.total} pageSize={pageSize} subject="de abonamente" onPage={(page) => setFilters({ ...filters, page })} />
      </>}
    </Card>
  </section>
}

function periodNote(item: BillingSubscription) {
  if (item.cancelAtPeriodEnd) return 'Anulare programată la termen'
  if (item.subscriptionStatus === 'canceled') return 'Încheiat'
  return null
}

function SubscriptionRow({ item, configuration }: { item: BillingSubscription; configuration: BillingConfiguration | null }) {
  const note = periodNote(item)
  return (
    <TableRow>
      <TableCell><div className="stacked"><strong>{item.name || item.email}</strong>{item.name && <span>{item.email}</span>}</div></TableCell>
      <TableCell><div className="billing-cell-stack"><span className="capitalize">{item.effectivePlan}</span><BillingStatus status={item.subscriptionStatus} />{item.storedPlan !== item.effectivePlan && <span className="cell-note">Plan înregistrat: {item.storedPlan}</span>}</div></TableCell>
      <TableCell><div className="stacked"><span>{billingDate(item.currentPeriodEnd)}</span>{note && <span>{note}</span>}</div></TableCell>
      <TableCell className="tabular-nums">{billingNumber.format(item.credits)}</TableCell>
      <TableCell><div className="billing-cell-stack"><StripeObjectLink configuration={configuration} resource="customers" id={item.customerId} /><StripeObjectLink configuration={configuration} resource="subscriptions" id={item.subscriptionId} /></div></TableCell>
    </TableRow>
  )
}
