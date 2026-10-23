import type { DataExport } from '@/lib/settings'
import { Clock3 } from 'lucide-react'
import { LoadingIndicator } from '@/components/ui/loading-indicator'
import { useLocale, useTranslations } from 'next-intl'
import styles from './settings-panels.module.css'

function ExportStatus({ status }: { status: DataExport['status'] }) {
  const t = useTranslations('settings')
  return (
    <span className={styles.exportStatus} data-export-status={status}>
      {status === 'processing' ? (
        <LoadingIndicator className="size-4" />
      ) : status === 'pending' ? (
        <Clock3 className="size-4" aria-hidden="true" />
      ) : (
        <span className={styles.statusDot} />
      )}
      {t(`exportStatus.${status}`)}
    </span>
  )
}

export function SettingsExportHistory({
  exports,
  timezone
}: {
  exports: DataExport[]
  timezone: string
}) {
  const t = useTranslations('settings')
  const locale = useLocale()
  const formatter = new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: timezone
  })
  return (
    <section
      className={styles.exportHistory}
      data-settings-export-history
      aria-labelledby="settings-export-history-title"
    >
      <h3 id="settings-export-history-title" className={styles.subheading}>
        {t('exportHistory')}
      </h3>
      {exports.length ? (
        <table className={styles.historyTable}>
          <thead>
            <tr>
              <th scope="col">{t('panelsDesign.requested')}</th>
              <th scope="col">{t('panelsDesign.status')}</th>
            </tr>
          </thead>
          <tbody>
            {exports.map((item) => (
              <tr key={item.id}>
                <td>
                  <time dateTime={item.requestedAt}>
                    {formatter.format(new Date(item.requestedAt))}
                  </time>
                </td>
                <td>
                  <ExportStatus status={item.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className={styles.hint}>{t('noExports')}</p>
      )}
    </section>
  )
}
