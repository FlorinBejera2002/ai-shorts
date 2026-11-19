'use client'

import ui from '@/components/shared/reference-ui.module.css'
import { Link } from '@/i18n/navigation'
import type { DataExport } from '@/lib/settings'
import { Download, FileText, Package, Shield, Trash2 } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { Chevron, FieldError, IconCircle, SettingsCard, StatusDot } from './settings-ui'
import type { AccountSettingsController } from './use-account-settings'
import type { SettingsPanelsController } from './use-settings-panels'
import styles from './settings.module.css'

type Props = { account: AccountSettingsController; panels: SettingsPanelsController; mobile: boolean }

const VISIBLE_EXPORTS = 3

function ExportRow({ item, timezone }: { item: DataExport; timezone?: string }) {
  const t = useTranslations('settings')
  const locale = useLocale()
  const date = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: timezone }).format(new Date(item.requestedAt))
  return (
    <div className={styles.row} data-settings-export-row={item.status}>
      <IconCircle>
        <Package aria-hidden="true" />
      </IconCircle>
      <time className={styles.rowLabel} dateTime={item.requestedAt}>
        {date}
      </time>
      <StatusDot tone={item.status === 'completed' ? 'ok' : 'muted'}>{t(`exportStatus.${item.status}`)}</StatusDot>
    </div>
  )
}

function ExportCard({ account, panels, mobile }: Props) {
  const t = useTranslations('settings.page')
  const exportButton = (
    <button
      type="button"
      className={`${ui.button} ${ui.primary} ${ui.focus}`}
      disabled={account.blocked}
      aria-busy={account.busy === 'export' || undefined}
      onClick={account.exportData}
      data-settings-export=""
    >
      <Download aria-hidden="true" />
      {t('exportAction')}
    </button>
  )
  const exports = panels.data?.exports.slice(0, VISIBLE_EXPORTS) ?? []
  return (
    <SettingsCard list data-settings-card="export">
      <div className={styles.exportHead}>
        <img src="/illustrations/settings-export.webp" alt={t('exportIllustration')} width={104} height={104} />
        <span className={styles.stack}>
          <h2 className={styles.cardTitle}>{t('exportTitle')}</h2>
          <span className={styles.meta}>{t('exportDescription')}</span>
        </span>
        {!mobile && exportButton}
      </div>
      {mobile && <span className={styles.exportMobileAction}>{exportButton}</span>}
      <FieldError message={account.errors.export} />
      {exports.length > 0 && (
        <div className={styles.exports} data-settings-export-history="">
          {exports.map((item) => (
            <ExportRow key={item.id} item={item} timezone={panels.data?.preferences.timezone} />
          ))}
        </div>
      )}
    </SettingsCard>
  )
}

function DocumentsCard() {
  const t = useTranslations('settings.page')
  return (
    <SettingsCard list title={t('documents')} data-settings-card="documents">
      <Link href="/privacy" className={`${styles.row} ${styles.focus}`} data-settings-document="privacy">
        <IconCircle>
          <Shield aria-hidden="true" />
        </IconCircle>
        <span className={styles.rowLabel}>{t('privacyPolicy')}</span>
        <Chevron />
      </Link>
      <Link href="/terms" className={`${styles.row} ${styles.focus}`} data-settings-document="terms">
        <IconCircle>
          <FileText aria-hidden="true" />
        </IconCircle>
        <span className={styles.rowLabel}>{t('terms')}</span>
        <Chevron />
      </Link>
    </SettingsCard>
  )
}

function DeleteCard({ account }: Props) {
  const t = useTranslations('settings.page')
  return (
    <SettingsCard data-settings-card="delete">
      <div className={styles.deleteRow}>
        <IconCircle tone="danger">
          <Trash2 aria-hidden="true" />
        </IconCircle>
        <span className={styles.stack}>
          <b className={styles.strong}>{t('deleteAccount')}</b>
          <span className={styles.meta}>{t('deleteIrreversible')}</span>
        </span>
        <button
          type="button"
          className={`${ui.button} ${ui.secondary} ${ui.focus} ${styles.dangerText} ${styles.deleteButton}`}
          disabled={account.blocked}
          onClick={() => account.onDeleteOpenChange(true)}
          data-settings-delete-open=""
        >
          {t('deleteAccount')}
        </button>
      </div>
    </SettingsCard>
  )
}

/** "Date și confidențialitate": data export, legal documents and account deletion. */
export function SettingsPrivacySection(props: Props) {
  return (
    <>
      <ExportCard {...props} />
      <DocumentsCard />
      <DeleteCard {...props} />
    </>
  )
}
