import { ArrowUpRight } from 'lucide-react'
import { StatGrid } from '../components/stat-grid'
import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'
import { billingNumber } from './formatters'
import { stripeDashboardLink } from './stripe-links'
import type { BillingOverview } from './types'

export function BillingOverviewCards({ overview }: { overview: BillingOverview }) {
  const { configuration, accounts, events } = overview
  const dashboard = stripeDashboardLink(configuration)
  const missing = ([
    ['Cheie server', configuration.secretKeyConfigured], ['Webhook', configuration.webhookConfigured],
    ['Prețuri', configuration.plansConfigured], ['Portal', configuration.portalConfigured]
  ] as const).filter(([, ready]) => !ready).map(([label]) => label)

  return <>
    <StatGrid label="Situația abonamentelor" stats={[
      { label: 'Abonamente active', value: accounts.activeSubscriptions },
      { label: 'Necesită atenție', value: accounts.attentionRequired, alert: accounts.attentionRequired > 0 },
      { label: 'Anulări programate', value: accounts.scheduledCancellations },
      { label: 'Evenimente 24 h', value: events.processedLast24Hours }
    ]} />
    <section className="billing-distribution">
      <Card className="panel">
        <div className="panel-heading">
          <h2>Stripe</h2>
          {dashboard && <Button variant="secondary" size="sm" asChild><a href={dashboard} target="_blank" rel="noopener noreferrer">Deschide Stripe <ArrowUpRight aria-hidden="true" /></a></Button>}
        </div>
        <p className={missing.length ? 'billing-status' : 'billing-status ok'}>{missing.length ? `Lipsește: ${missing.join(', ')}` : 'Configurat'}</p>
      </Card>
      <Card className="panel">
        <h2>Planuri</h2>
        {overview.plans.length
          ? <dl className="value-list">{overview.plans.map(({ plan, accounts: count }) => <div key={plan}><dt className="capitalize">{plan}</dt><dd>{billingNumber.format(count)}</dd></div>)}</dl>
          : <p className="billing-status">—</p>}
      </Card>
    </section>
  </>
}
