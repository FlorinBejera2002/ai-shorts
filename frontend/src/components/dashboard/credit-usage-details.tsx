import { useFormatter, useLocale, useTranslations } from 'next-intl'
import { useMemo } from 'react'
import { Link } from '@/i18n/navigation'
import type { useCreditUsage } from './sidebar-usage'
import styles from './credit-usage-indicator.module.css'

type Resource = ReturnType<typeof useCreditUsage>

function FiniteCreditDetails({ usage, period }: { usage: NonNullable<Resource['usage']>; period: Resource['period'] }) {
  const t = useTranslations('creditUsage')
  const format = useFormatter()
  const locale = useLocale()
  const date = useMemo(() => new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }), [locale])
  return <>
    <p>{t('available', { count: format.number(usage.credits) })}</p>
    <p className={styles.muted}>{t('allowance', { count: format.number(usage.allowance) })}</p>
    {usage.credits > usage.allowance && <p className={styles.muted}>{t('additional')}</p>}
    {usage.plan === 'free' && <p className={styles.muted}>{t('noReset')}</p>}
    {period && <p className={styles.muted}>{t(period.kind, { date: date.format(new Date(period.date)) })}</p>}
  </>
}

export function CreditUsageDetails({ resource, summary, titleId, onNavigate }: {
  resource: Resource; summary: string; titleId: string; onNavigate: () => void
}) {
  const t = useTranslations('creditUsage')
  const { usage, period, error, refreshing, refresh } = resource
  return <>
    <h2 id={titleId}>{t('title')}</h2>
    <p className={styles.summary}>{summary}</p>
    {usage && (usage.unlimited
      ? <p className={styles.muted}>{t('unlimitedDetail')}</p>
      : <FiniteCreditDetails usage={usage} period={period} />)}
    {error && <p className={styles.muted} role="status">{t(usage ? 'stale' : 'unavailable')}</p>}
    {error && <button className={styles.action} type="button" disabled={refreshing} onClick={refresh}>{t('retry')}</button>}
    <Link className={styles.action} href="/dashboard/billing" prefetch={false} onClick={onNavigate}>{t('billing')}</Link>
  </>
}
