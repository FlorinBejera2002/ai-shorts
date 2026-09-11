'use client'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

import { Download, ExternalLink, ReceiptText, RefreshCw } from 'lucide-react'

import type { BillingInvoice, BillingLocale } from '@/lib/billing'
import { safeHttpsUrl } from '@/lib/billing'

type InvoiceStatusLabels = {
  draft: string
  open: string
  paid: string
  uncollectible: string
  void: string
  unknown: string
}

type InvoiceHistoryLabels = {
  title: string
  tableCaption: string
  number: string
  date: string
  status: string
  amount: string
  actions: string
  viewInvoice: string
  downloadPdf: string
  noInvoicesTitle: string
  noInvoicesDescription: string
  providerUnavailableTitle: string
  providerUnavailableDescription: string
  retry: string
  statuses: InvoiceStatusLabels
}

type InvoiceHistoryProps = {
  invoices: BillingInvoice[]
  locale: BillingLocale
  providerAvailable: boolean
  hasBillingProfile: boolean
  labels: InvoiceHistoryLabels
}

function formatCurrency(
  amount: number,
  currency: string,
  locale: BillingLocale
): string {
  const normalizedCurrency = /^[a-z]{3}$/i.test(currency)
    ? currency.toUpperCase()
    : 'USD'

  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: normalizedCurrency
    }).format(amount / 100)
  } catch {
    return `${(amount / 100).toFixed(2)} ${normalizedCurrency}`
  }
}

function formatDate(value: string, locale: BillingLocale): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '\u2014'

  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  }).format(date)
}

function statusClass(status: string): string {
  if (status === 'paid') return 'bg-success/10 text-success'
  if (status === 'open') return 'bg-warning/10 text-warning'
  if (status === 'uncollectible') {
    return 'bg-destructive/10 text-destructive'
  }
  return 'bg-muted text-muted-foreground'
}

function invoiceStatusLabel(
  status: string,
  labels: InvoiceStatusLabels
): string {
  if (status === 'draft') return labels.draft
  if (status === 'open') return labels.open
  if (status === 'paid') return labels.paid
  if (status === 'uncollectible') return labels.uncollectible
  if (status === 'void') return labels.void
  return labels.unknown
}

function InvoiceActions({
  invoice,
  labels
}: {
  invoice: BillingInvoice
  labels: InvoiceHistoryLabels
}) {
  const hostedUrl = safeHttpsUrl(invoice.hostedUrl)
  const pdfUrl = safeHttpsUrl(invoice.pdfUrl)

  if (!hostedUrl && !pdfUrl) {
    return <span className="text-muted-foreground">\u2014</span>
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {hostedUrl && (
        <a
          href={hostedUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          {labels.viewInvoice}
        </a>
      )}
      {pdfUrl && (
        <a
          href={pdfUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Download className="h-3.5 w-3.5" aria-hidden="true" />
          {labels.downloadPdf}
        </a>
      )}
    </div>
  )
}

export function InvoiceHistory({
  invoices,
  locale,
  providerAvailable,
  hasBillingProfile,
  labels
}: InvoiceHistoryProps) {
  return (
    <section className="mt-6" aria-labelledby="billing-invoices-title">
      <div className="mb-3">
        <h2 id="billing-invoices-title" className="text-base font-semibold">
          {labels.title}
        </h2>
      </div>

      {!providerAvailable && hasBillingProfile ? (
        <Card
          className="block gap-0 py-0 flex flex-col items-start gap-4 border-warning/25 p-5 sm:flex-row sm:items-center sm:justify-between"
          role="alert"
        >
          <div>
            <h3 className="text-sm font-semibold">
              {labels.providerUnavailableTitle}
            </h3>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              {labels.providerUnavailableDescription}
            </p>
          </div>
          <Button
            type="button"
            onClick={() => window.location.reload()}
            variant="outline"
            className="h-9 shrink-0 rounded-md"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            {labels.retry}
          </Button>
        </Card>
      ) : invoices.length === 0 ? (
        <Card className="block gap-0 py-0 px-4 py-7 text-center">
          <ReceiptText
            className="mx-auto h-7 w-7 text-muted-foreground/60"
            aria-hidden="true"
          />
          <h3 className="mt-3 text-sm font-semibold">
            {labels.noInvoicesTitle}
          </h3>
          <p className="mx-auto mt-1 max-w-lg text-sm text-muted-foreground">
            {labels.noInvoicesDescription}
          </p>
        </Card>
      ) : (
        <Card className="block gap-0 py-0 overflow-hidden p-0">
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full border-collapse text-left text-sm">
              <caption className="sr-only">{labels.tableCaption}</caption>
              <thead>
                <tr className="border-b border-border bg-card text-xs text-muted-foreground">
                  <th scope="col" className="px-5 py-3 font-medium">
                    {labels.number}
                  </th>
                  <th scope="col" className="px-5 py-3 font-medium">
                    {labels.date}
                  </th>
                  <th scope="col" className="px-5 py-3 font-medium">
                    {labels.status}
                  </th>
                  <th scope="col" className="px-5 py-3 font-medium">
                    {labels.amount}
                  </th>
                  <th scope="col" className="px-5 py-3 font-medium">
                    {labels.actions}
                  </th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => (
                  <tr
                    key={invoice.id}
                    className="border-b border-border/70 last:border-b-0"
                  >
                    <th scope="row" className="px-5 py-4 font-semibold">
                      {invoice.number}
                    </th>
                    <td className="whitespace-nowrap px-5 py-4 text-muted-foreground">
                      {formatDate(invoice.createdAt, locale)}
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`inline-flex rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-[0.08em] ${statusClass(invoice.status)}`}
                      >
                        {invoiceStatusLabel(invoice.status, labels.statuses)}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 font-medium tabular-nums">
                      {formatCurrency(invoice.amount, invoice.currency, locale)}
                    </td>
                    <td className="px-5 py-4">
                      <InvoiceActions invoice={invoice} labels={labels} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="divide-y divide-border sm:hidden">
            {invoices.map((invoice) => (
              <li key={invoice.id} className="space-y-4 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground">
                      {labels.number}
                    </p>
                    <p className="mt-1 text-sm font-semibold">
                      {invoice.number}
                    </p>
                  </div>
                  <span
                    className={`inline-flex rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-[0.08em] ${statusClass(invoice.status)}`}
                  >
                    {invoiceStatusLabel(invoice.status, labels.statuses)}
                  </span>
                </div>
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-xs text-muted-foreground">
                      {labels.date}
                    </dt>
                    <dd className="mt-1">
                      {formatDate(invoice.createdAt, locale)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">
                      {labels.amount}
                    </dt>
                    <dd className="mt-1 font-semibold tabular-nums">
                      {formatCurrency(invoice.amount, invoice.currency, locale)}
                    </dd>
                  </div>
                </dl>
                <InvoiceActions invoice={invoice} labels={labels} />
              </li>
            ))}
          </ul>
        </Card>
      )}
    </section>
  )
}
