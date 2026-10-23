import { ArrowUpRight, CircleAlert, LoaderCircle } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { stripeDashboardLink } from './stripe-links'
import { statusLabel } from './formatters'
import type { BillingConfiguration } from './types'

export function BillingStatus({ status }: { status: string }) {
  const attention = ['past_due', 'unpaid', 'incomplete', 'paused'].includes(status)
  return <Badge variant={attention ? 'destructive' : 'outline'}>{statusLabel(status)}</Badge>
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
  return <div className="billing-feedback" role="status"><LoaderCircle className="animate-spin" size={18} /><p>{children}</p></div>
}

export function BillingError({ message, retry }: { message: string; retry: () => void }) {
  return <div className="billing-feedback" role="alert"><CircleAlert size={20} /><p>{message}</p><Button variant="outline" size="sm" onClick={retry}>Reîncearcă încărcarea</Button></div>
}
