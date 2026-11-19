'use client'

import type { BillingInvoice, BillingLocale } from '@/lib/billing'
import { safeHttpsUrl } from '@/lib/billing'
import { ChevronRight, Download, ReceiptText, RotateCw } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { formatBillingDate, formatInvoiceAmount } from './billing-format'
import type { BillingTone } from './billing-overview'
import ui from './billing-ui.module.css'
import styles from './invoice-history.module.css'

const RECENT_INVOICES = 3
const INVOICE_STATUSES = ['draft', 'open', 'paid', 'uncollectible', 'void'] as const
const STATUS_TONES: Record<string, BillingTone> = { paid: 'success', open: 'warning', uncollectible: 'warning' }

type InvoiceHistoryProps = {
  invoices: BillingInvoice[]
  locale: BillingLocale
  providerAvailable: boolean
  /** Overview card (latest three, "View all") or the full history page. */
  variant: 'recent' | 'full'
  onViewAll: () => void
  onRetry: () => void
  retrying: boolean
}

function statusKey(status: string) {
  return (INVOICE_STATUSES as readonly string[]).includes(status) ? status : 'unknown'
}

function InvoiceRow({ invoice, locale }: { invoice: BillingInvoice; locale: BillingLocale }) {
  const t = useTranslations('billing')
  const hostedUrl = safeHttpsUrl(invoice.hostedUrl)
  const pdfUrl = safeHttpsUrl(invoice.pdfUrl)
  const status = statusKey(invoice.status)
  return (
    <tr className={styles.row} data-billing-invoice={invoice.id}>
      <td className={styles.date}>{formatBillingDate(invoice.createdAt, locale) ?? '—'}</td>
      <td className={`${ui.muted} ${styles.number}`}>{invoice.number}</td>
      <td className={styles.amount}>{formatInvoiceAmount(invoice.amount, invoice.currency, locale)}</td>
      <td className={styles.status}>
        <span className={ui.dotStatus} data-tone={STATUS_TONES[status] ?? 'neutral'}>
          {t(`invoiceStatuses.${status}`)}
        </span>
      </td>
      <td className={styles.actions}>
        {hostedUrl && (
          <a
            href={hostedUrl}
            target="_blank"
            rel="noreferrer"
            className={`${ui.button} ${ui.ghost} ${styles.textAction} ${pdfUrl ? styles.viewAction : ''}`}
            aria-label={t('canvas.viewInvoice', { number: invoice.number })}
            data-billing-invoice-view=""
          >
            {t('viewInvoice')}
          </a>
        )}
        {pdfUrl && (
          <a
            href={pdfUrl}
            target="_blank"
            rel="noreferrer"
            className={styles.pdfAction}
            aria-label={t('canvas.downloadPdf', { number: invoice.number })}
            title={t('downloadPdf')}
            data-billing-invoice-pdf=""
          >
            <Download aria-hidden="true" />
            <span>{t('downloadPdf')}</span>
          </a>
        )}
      </td>
    </tr>
  )
}

function InvoiceEmpty({
  providerAvailable,
  onRetry,
  retrying
}: Pick<InvoiceHistoryProps, 'providerAvailable' | 'onRetry' | 'retrying'>) {
  const t = useTranslations('billing')
  return (
    <div className={styles.empty} data-billing-invoices-empty={providerAvailable ? 'none' : 'unavailable'}>
      <span className={`${ui.iconCircle} ${styles.emptyIcon}`}>
        <ReceiptText aria-hidden="true" />
      </span>
      <span className={styles.emptyCopy}>
        <b>{t(providerAvailable ? 'noInvoicesTitle' : 'providerUnavailableTitle')}</b>
        <span className={ui.muted}>{t(providerAvailable ? 'noInvoicesDesc' : 'providerUnavailableDesc')}</span>
      </span>
      {!providerAvailable && (
        <button
          type="button"
          className={`${ui.button} ${ui.secondary} ${styles.retry}`}
          onClick={onRetry}
          disabled={retrying}
          aria-busy={retrying}
          data-billing-invoices-retry=""
        >
          <RotateCw aria-hidden="true" />
          {t('retry')}
        </button>
      )}
    </div>
  )
}

/** Stripe invoices with hosted view and PDF links; amounts and dates only, never credits. */
export function InvoiceHistory({
  invoices,
  locale,
  providerAvailable,
  variant,
  onViewAll,
  onRetry,
  retrying
}: InvoiceHistoryProps) {
  const t = useTranslations('billing')
  const recent = variant === 'recent'
  const shown = recent ? invoices.slice(0, RECENT_INVOICES) : invoices
  const hasRows = shown.length > 0
  return (
    <section
      className={`${ui.card} ${styles.history}`}
      data-variant={variant}
      data-empty={!hasRows || undefined}
      aria-labelledby={recent ? 'billing-invoices-title' : undefined}
      aria-label={recent ? undefined : t('invoicesTitle')}
      data-billing-invoices={variant}
    >
      {recent && (
        <div className={styles.head}>
          <h2 id="billing-invoices-title" className={`${ui.heading} ${styles.title}`}>
            {t('invoicesTitle')}
          </h2>
          {hasRows && (
            <button
              type="button"
              className={`${ui.button} ${ui.ghost} ${styles.viewAll}`}
              onClick={onViewAll}
              data-billing-view-all=""
            >
              {t('canvas.viewAll')}
              <ChevronRight aria-hidden="true" />
            </button>
          )}
        </div>
      )}
      {hasRows ? (
        <table className={styles.table} aria-label={t(recent ? 'canvas.recentInvoices' : 'invoicesTitle')}>
          {!recent && (
            <thead>
              <tr className={`${styles.row} ${styles.header}`}>
                <th scope="col">{t('invoiceDate')}</th>
                <th scope="col">{t('invoiceNumber')}</th>
                <th scope="col">{t('invoiceAmount')}</th>
                <th scope="col">{t('invoiceStatus')}</th>
                <th scope="col">{t('invoiceActions')}</th>
              </tr>
            </thead>
          )}
          <tbody>
            {shown.map((invoice) => (
              <InvoiceRow key={invoice.id} invoice={invoice} locale={locale} />
            ))}
          </tbody>
        </table>
      ) : (
        <InvoiceEmpty providerAvailable={providerAvailable} onRetry={onRetry} retrying={retrying} />
      )}
    </section>
  )
}
