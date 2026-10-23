'use client'

import { Button } from '@/components/ui/button'
import { LoadingIndicator } from '@/components/ui/loading-indicator'
import {
  Download,
  ExternalLink,
  ReceiptText,
  RefreshCw,
  ChevronRight
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { BillingInvoice, BillingLocale } from '@/lib/billing'
import { safeHttpsUrl } from '@/lib/billing'
import styles from './invoice-history.module.css'

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
  labels?: InvoiceHistoryLabels
  onRetry: () => void
  retrying?: boolean
  compact?: boolean
  onViewAll?: () => void
  showTitle?: boolean
}

function formatCurrency(
  amount: number,
  currency: string,
  locale: BillingLocale
) {
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

function formatDate(value: string, locale: BillingLocale) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '\u2014'
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'ro-RO', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  }).format(date)
}

function invoiceStatusLabel(status: string, labels: InvoiceStatusLabels) {
  if (
    status === 'draft' ||
    status === 'open' ||
    status === 'paid' ||
    status === 'uncollectible' ||
    status === 'void'
  )
    return labels[status]
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
  if (!hostedUrl && !pdfUrl)
    return <span className="text-muted-foreground">{'\u2014'}</span>
  return (
    <div className={styles.actions}>
      {hostedUrl && (
        <a
          href={hostedUrl}
          target="_blank"
          rel="noreferrer"
          aria-label={`${labels.viewInvoice}: ${invoice.number}`}
        >
          <ExternalLink aria-hidden="true" />
          <span>{labels.viewInvoice}</span>
        </a>
      )}
      {pdfUrl && (
        <a
          href={pdfUrl}
          target="_blank"
          rel="noreferrer"
          aria-label={`${labels.downloadPdf}: ${invoice.number}`}
        >
          <Download aria-hidden="true" />
          <span>{labels.downloadPdf}</span>
        </a>
      )}
    </div>
  )
}

function InvoiceTable({
  invoices,
  locale,
  labels
}: {
  invoices: BillingInvoice[]
  locale: BillingLocale
  labels: InvoiceHistoryLabels
}) {
  return (
    <table className={styles.table}>
      <caption className="sr-only">{labels.tableCaption}</caption>
      <thead>
        <tr>
          <th scope="col">{labels.date}</th>
          <th scope="col">{labels.number}</th>
          <th scope="col">{labels.amount}</th>
          <th scope="col">{labels.status}</th>
          <th scope="col">{labels.actions}</th>
        </tr>
      </thead>
      <tbody>
        {invoices.map((invoice) => (
          <tr key={invoice.id} data-billing-invoice={invoice.id}>
            <td className={styles.date}>
              {formatDate(invoice.createdAt, locale)}
            </td>
            <th scope="row" className={styles.number}>
              {invoice.number}
            </th>
            <td className={styles.amount}>
              {formatCurrency(invoice.amount, invoice.currency, locale)}
            </td>
            <td className={styles.statusCell}>
              <span className={styles.status} data-status={invoice.status}>
                <span aria-hidden="true" />
                {invoiceStatusLabel(invoice.status, labels.statuses)}
              </span>
            </td>
            <td className={styles.actionCell}>
              <InvoiceActions invoice={invoice} labels={labels} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function InvoiceHistory({
  invoices,
  locale,
  providerAvailable,
  hasBillingProfile,
  labels: suppliedLabels,
  onRetry,
  retrying = false,
  compact = false,
  onViewAll,
  showTitle = true
}: InvoiceHistoryProps) {
  const t = useTranslations('billing')
  const labels: InvoiceHistoryLabels = suppliedLabels ?? {
    title: t('invoicesTitle'),
    tableCaption: t('invoicesTableCaption'),
    number: t('invoiceNumber'),
    date: t('invoiceDate'),
    status: t('invoiceStatus'),
    amount: t('invoiceAmount'),
    actions: t('invoiceActions'),
    viewInvoice: t('viewInvoice'),
    downloadPdf: t('downloadPdf'),
    noInvoicesTitle: t('noInvoicesTitle'),
    noInvoicesDescription: t('noInvoicesDesc'),
    providerUnavailableTitle: t('providerUnavailableTitle'),
    providerUnavailableDescription: t('providerUnavailableDesc'),
    retry: t('retry'),
    statuses: {
      draft: t('invoiceStatuses.draft'),
      open: t('invoiceStatuses.open'),
      paid: t('invoiceStatuses.paid'),
      uncollectible: t('invoiceStatuses.uncollectible'),
      void: t('invoiceStatuses.void'),
      unknown: t('invoiceStatuses.unknown')
    }
  }
  const unavailable = !providerAvailable && hasBillingProfile
  const visibleInvoices = compact ? invoices.slice(0, 3) : invoices
  return (
    <section
      className={styles.history}
      data-billing-invoices={compact ? 'preview' : 'full'}
      data-compact={compact}
      aria-label={labels.title}
    >
      {showTitle && <h2>{labels.title}</h2>}
      {unavailable && (
        <div className={styles.unavailable} role="alert">
          <div>
            <h3>{labels.providerUnavailableTitle}</h3>
            <p>{labels.providerUnavailableDescription}</p>
          </div>
          <Button
            type="button"
            onClick={onRetry}
            disabled={retrying}
            aria-busy={retrying}
            variant="outline"
          >
            {retrying ? (
              <LoadingIndicator className="size-4" />
            ) : (
              <RefreshCw aria-hidden="true" />
            )}
            {labels.retry}
          </Button>
        </div>
      )}
      {visibleInvoices.length > 0 ? (
        <>
          <InvoiceTable
            invoices={visibleInvoices}
            locale={locale}
            labels={labels}
          />
          {compact && onViewAll && (
            <button
              type="button"
              className={styles.viewAll}
              onClick={onViewAll}
              data-billing-view-all=""
            >
              {t('sectionDesign.viewAllInvoices')}
              <ChevronRight aria-hidden="true" />
            </button>
          )}
        </>
      ) : (
        !unavailable && (
          <div className={styles.empty}>
            <ReceiptText aria-hidden="true" />
            <h3>{labels.noInvoicesTitle}</h3>
            <p>{labels.noInvoicesDescription}</p>
          </div>
        )
      )}
    </section>
  )
}
