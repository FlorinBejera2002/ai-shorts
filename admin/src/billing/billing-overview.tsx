import { ArrowUpRight, Check, CircleAlert } from 'lucide-react'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'
import { billingDate, billingNumber, statusLabel } from './formatters'
import { stripeDashboardLink } from './stripe-links'
import type { BillingOverview } from './types'

export function BillingOverviewCards({ overview }: { overview: BillingOverview }) {
  const { configuration, accounts, events } = overview
  const dashboard = stripeDashboardLink(configuration)
  const settings = [
    ['Cheie server', configuration.secretKeyConfigured], ['Webhook', configuration.webhookConfigured],
    ['Prețuri planuri', configuration.plansConfigured], ['Customer Portal', configuration.portalConfigured]
  ] as const
  const metrics = [
    ['Abonamente cu acces activ', accounts.activeSubscriptions, 'Active sau în trial, cu perioadă validă'],
    ['Necesită atenție', accounts.attentionRequired, 'Plăți incomplete, restante sau acces expirat'],
    ['Anulări programate', accounts.scheduledCancellations, 'Accesul se încheie la termenul afișat'],
    ['Profiluri de facturare', accounts.billingProfiles, `${billingNumber.format(accounts.subscriptions)} abonamente înregistrate`]
  ] as const
  return <>
    <Card className="panel billing-configuration">
      <div className="panel-heading"><div><p className="eyebrow">Configurația serverului</p><h2>Stripe <Badge variant="outline">{configuration.mode === 'live' ? 'Live' : configuration.mode === 'test' ? 'Sandbox' : 'Mod necunoscut'}</Badge></h2></div>
        {dashboard && <Button variant="outline" size="sm" asChild><a href={dashboard} target="_blank" rel="noopener noreferrer">Deschide Stripe <ArrowUpRight aria-hidden="true" /></a></Button>}
      </div>
      <div className="billing-configuration-list">{settings.map(([label, ready]) => <div key={label}>{ready ? <Check aria-hidden="true" size={15} /> : <CircleAlert aria-hidden="true" size={15} />}<span>{label}</span><strong>{ready ? 'Configurat' : 'Lipsește'}</strong></div>)}</div>
      <p className="billing-note">Checkout: {configuration.checkoutReady ? 'configurat' : 'configurație incompletă'} · Portal: {configuration.portalReady ? 'configurat' : 'configurație incompletă'}. Indicatorii confirmă prezența setărilor, fără verificare în timp real a conexiunii Stripe.</p>
      {configuration.expectedAccountId && <p className="billing-note">Cont Stripe: <code>{configuration.expectedAccountId}</code></p>}
    </Card>
    <section className="metric-grid" aria-label="Situația abonamentelor">{metrics.map(([label, value, detail]) => <Card className="metric-card" key={label}><span>{label}</span><strong>{billingNumber.format(value)}</strong><small>{detail}</small></Card>)}</section>
    <section className="billing-distribution">
      <Card className="panel"><div className="panel-heading"><h2>Acces efectiv pe plan</h2></div><div className="billing-counts">{overview.plans.length ? overview.plans.map(({ plan, accounts: count }) => <div key={plan}><span className="capitalize">{plan}</span><strong>{billingNumber.format(count)}</strong></div>) : <p className="billing-note">Nu există profiluri de facturare.</p>}</div></Card>
      <Card className="panel"><div className="panel-heading"><h2>Stări înregistrate</h2></div><div className="billing-counts">{overview.statuses.length ? overview.statuses.map(({ status, accounts: count }) => <div key={status}><span>{statusLabel(status)}</span><strong>{billingNumber.format(count)}</strong></div>) : <p className="billing-note">Nu există abonamente înregistrate.</p>}</div></Card>
      <Card className="panel"><div className="panel-heading"><h2>Procesare evenimente</h2></div><dl className="billing-counts"><div><dt>Procesate în total</dt><dd>{billingNumber.format(events.processedTotal)}</dd></div><div><dt>În ultimele 24 de ore</dt><dd>{billingNumber.format(events.processedLast24Hours)}</dd></div><div><dt>Alocări de credite</dt><dd>{billingNumber.format(events.creditGrantsTotal)}</dd></div></dl><p className="billing-note">Ultima procesare: {billingDate(events.lastProcessedAt)}. Alocările reprezintă numărul de operațiuni, nu soldul creditelor.</p></Card>
    </section>
  </>
}
