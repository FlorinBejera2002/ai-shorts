import { ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { useState } from 'react'
import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table'
import { BillingError, BillingLoading, BillingStatus, StripeObjectLink } from './billing-shared'
import { billingDate, billingNumber, statusLabel } from './formatters'
import type { BillingConfiguration, BillingSubscriptions } from './types'
import { useBillingQuery } from './use-billing-query'

const pageSize = 25
const statuses = ['active', 'trialing', 'past_due', 'unpaid', 'incomplete', 'incomplete_expired', 'paused', 'canceled', 'none']

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
    <div className="billing-section-heading"><div><h2 id="billing-subscriptions-heading">Conturi și abonamente</h2><p>Profiluri Stripe înregistrate în Sneep Cut. Planul efectiv determină accesul curent.</p></div></div>
    <div className="toolbar">
      <div className="search-box"><Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" /><Input className="pl-9" aria-label="Caută profiluri Stripe" placeholder="Nume, email sau ID Stripe" value={filters.query} onChange={(event) => setFilters({ ...filters, query: event.target.value, page: 1 })} /></div>
      <Select value={filters.status} onValueChange={(status) => setFilters({ ...filters, status, page: 1 })}><SelectTrigger className="w-full sm:w-44" aria-label="Starea abonamentului"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Toate stările</SelectItem>{statuses.map((status) => <SelectItem value={status} key={status}>{statusLabel(status)}</SelectItem>)}</SelectContent></Select>
      <Select value={filters.plan} onValueChange={(plan) => setFilters({ ...filters, plan, page: 1 })}><SelectTrigger className="w-full sm:w-40" aria-label="Planul efectiv"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Toate planurile</SelectItem>{['free', 'creator', 'pro', 'agency'].map((plan) => <SelectItem key={plan} value={plan}>{plan.charAt(0).toUpperCase() + plan.slice(1)}</SelectItem>)}</SelectContent></Select>
      {data && <span className="result-count">{billingNumber.format(data.total)} profiluri</span>}
    </div>
    <Card className="table-panel" aria-busy={state.loading}>
      {state.loading ? <BillingLoading /> : state.error ? <BillingError message={state.error} retry={() => setRetry((value) => value + 1)} /> : data && <>
        <Table className="billing-subscriptions-table"><TableHeader><TableRow><TableHead>Utilizator</TableHead><TableHead>Acces și stare</TableHead><TableHead>Perioadă</TableHead><TableHead>Credite</TableHead><TableHead>Identificatori Stripe</TableHead><TableHead>Ultimul eveniment sursă</TableHead></TableRow></TableHeader>
          <TableBody>{data.items.length === 0 ? <TableRow><TableCell colSpan={6} className="h-32 text-center text-muted-foreground">Niciun profil Stripe găsit pentru aceste filtre.</TableCell></TableRow> : data.items.map((item) => <TableRow key={item.id}>
            <TableCell><div className="stacked"><strong>{item.name || 'Fără nume'}</strong><span>{item.email}</span></div></TableCell>
            <TableCell><div className="billing-cell-stack"><strong className="capitalize">{item.effectivePlan}</strong><BillingStatus status={item.subscriptionStatus} />{item.storedPlan !== item.effectivePlan && <span className="billing-note">Plan înregistrat: {item.storedPlan}</span>}</div></TableCell>
            <TableCell><div className="stacked"><strong>{billingDate(item.currentPeriodEnd)}</strong><span>{item.cancelAtPeriodEnd ? 'Anulare programată la termen' : item.subscriptionStatus === 'canceled' ? 'Abonament încheiat' : 'Sfârșitul perioadei curente'}</span></div></TableCell>
            <TableCell>{billingNumber.format(item.credits)}</TableCell>
            <TableCell><div className="billing-cell-stack"><StripeObjectLink configuration={configuration} resource="customers" id={item.customerId} /><StripeObjectLink configuration={configuration} resource="subscriptions" id={item.subscriptionId} /></div></TableCell>
            <TableCell>{billingDate(item.stateEventCreatedAt)}</TableCell>
          </TableRow>)}</TableBody>
        </Table>
        <div className="pagination"><Button aria-label="Pagina anterioară de abonamente" variant="outline" size="icon" disabled={filters.page === 1} onClick={() => setFilters({ ...filters, page: filters.page - 1 })}><ChevronLeft size={16} /></Button><span>Pagina {filters.page} din {Math.max(1, Math.ceil(data.total / pageSize))}</span><Button aria-label="Pagina următoare de abonamente" variant="outline" size="icon" disabled={filters.page * pageSize >= data.total} onClick={() => setFilters({ ...filters, page: filters.page + 1 })}><ChevronRight size={16} /></Button></div>
      </>}
    </Card>
  </section>
}
