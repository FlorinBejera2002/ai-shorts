import { ArrowUpRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { PageLoader, StatePanel } from '../components/state-panel'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { statusLabel } from './formatters'
import { stripeDashboardLink } from './stripe-links'
import type { BillingConfiguration } from './types'

export function BillingStatus({ status }: { status: string }) {
  const attention = ['past_due', 'unpaid', 'incomplete', 'paused'].includes(status)
  const active = ['active', 'trialing'].includes(status)
  return <Badge variant={attention ? 'destructive' : active ? 'success' : 'outline'}>{statusLabel(status)}</Badge>
}

export function StripeObjectLink({ configuration, resource, id }: {
  configuration: BillingConfiguration | null
  resource: 'customers' | 'subscriptions' | 'events'
  id: string | null
}) {
  const href = stripeDashboardLink(configuration, resource, id)
  if (!id) return <span className="text-muted-foreground">—</span>
  return href
    ? <a className="billing-object-link" href={href} target="_blank" rel="noopener noreferrer">{id}<ArrowUpRight aria-hidden="true" size={12} /><span className="sr-only">Deschide în Stripe</span></a>
    : <span className="billing-object-id">{id}</span>
}

export function BillingLoading({ children = 'Se încarcă datele de facturare…' }: { children?: ReactNode }) {
  return <div className="billing-loading"><PageLoader compact /><p>{children}</p></div>
}

export function BillingError({ message, retry }: { message: string; retry: () => void }) {
  return <StatePanel compact role="alert" illustration="loadError" title="Nu am putut încărca datele" message={message} action={<Button variant="secondary" size="sm" onClick={retry}>Reîncearcă încărcarea</Button>} />
}

export function BillingSectionHeading({ id, title }: { id: string; title: string }) {
  return <h2 id={id} className="section-title billing-section-heading">{title}</h2>
}
