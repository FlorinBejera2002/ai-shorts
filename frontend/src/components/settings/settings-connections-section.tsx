'use client'

import { PlatformBrandIcon } from '@/components/publishing/platform-brand-icon'
import ui from '@/components/shared/reference-ui.module.css'
import { Plus } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { formatDate } from './settings-format'
import { SettingsLoadState } from './settings-load-state'
import { Pill, StatusDot } from './settings-ui'
import { useMountTime } from './use-mount-time'
import { connectionCards, type ConnectionCardData, type SettingsConnectionsController } from './use-settings-connections'
import styles from './settings.module.css'

const DAY = 86_400_000
const EXPIRY_WARNING_DAYS = 30

type CardProps = ConnectionCardData & { connections: SettingsConnectionsController }

/** The expiry line: "Activ până la …", a warning chip close to expiry, or expired. */
function Expiry({ date, days, expired }: { date: Date | null; days: number | null; expired: boolean }) {
  const t = useTranslations('settings')
  const locale = useLocale()
  if (expired) return <Pill tone="warning">{t('tokenExpired')}</Pill>
  if (!date || days === null) return null
  if (days <= EXPIRY_WARNING_DAYS) return <Pill tone="warning">{t('page.expiresIn', { days: Math.max(days, 1) })}</Pill>
  return (
    <span className={styles.meta}>
      {t('page.activeUntil', { date: formatDate(date, locale) })}
    </span>
  )
}

function ConnectedCard({ provider, account, connections }: CardProps & { account: NonNullable<CardProps['account']> }) {
  const t = useTranslations('settings')
  const expired = account.tokenExpired === true || account.status !== 'connected'
  const now = useMountTime()
  const parsed = account.tokenExpiresAt ? new Date(account.tokenExpiresAt) : null
  const date = parsed && !Number.isNaN(parsed.getTime()) ? parsed : null
  const days = date ? Math.ceil((date.getTime() - now) / DAY) : null
  const expiring = days !== null && days <= EXPIRY_WARNING_DAYS
  return (
    <section className={styles.connection} data-settings-connection={provider.id} data-settings-account={account.id}>
      <div className={styles.connectionHead}>
        <PlatformBrandIcon provider={provider.id} className={`rounded-full ${styles.connectionLogo}`} />
        <span className={styles.stack}>
          <b className={styles.connectionName}>{provider.name}</b>
          <span className={`${styles.meta} ${styles.ellipsis}`}>{account.username ? `@${account.username.replace(/^@/, '')}` : account.name}</span>
        </span>
        {!expired && <StatusDot tone="ok">{t('connectionsDesign.connected')}</StatusDot>}
      </div>
      <span className={styles.connectionExpiry}>
        <Expiry date={date} days={days} expired={expired} />
      </span>
      <div className={styles.connectionActions}>
        <button
          type="button"
          className={`${ui.button} ${expired || expiring ? ui.primary : ui.secondary} ${ui.focus}`}
          disabled={connections.busy || !provider.configured}
          aria-busy={connections.busyId === provider.id || undefined}
          onClick={() => connections.connect(provider.id)}
          data-settings-reconnect={provider.id}
        >
          {t('reconnect')}
        </button>
        <button
          type="button"
          className={`${ui.button} ${ui.secondary} ${ui.focus} ${styles.dangerText}`}
          disabled={connections.busy}
          onClick={() => connections.askDisconnect(account)}
          data-settings-disconnect={account.id}
        >
          {t('disconnect')}
        </button>
      </div>
    </section>
  )
}

function EmptyCard({ provider, connections }: CardProps) {
  const t = useTranslations('settings')
  return (
    <section className={styles.connection} data-settings-connection={provider.id} data-settings-empty="">
      <div className={styles.connectionHead}>
        <span className={styles.connectionAdd} aria-hidden="true">
          <Plus />
        </span>
        <span className={styles.connectionTitle}>
          <PlatformBrandIcon provider={provider.id} className={`rounded-full ${styles.connectionMark}`} />
          <b className={styles.connectionName}>{provider.name}</b>
        </span>
        <StatusDot tone="muted">{t('notConnected')}</StatusDot>
      </div>
      <div className={styles.connectionActions}>
        <button
          type="button"
          className={`${ui.button} ${ui.primary} ${ui.focus}`}
          disabled={connections.busy || !provider.configured}
          aria-busy={connections.busyId === provider.id || undefined}
          onClick={() => connections.connect(provider.id)}
          data-settings-connect={provider.id}
        >
          {provider.configured ? t('page.connectProvider', { provider: provider.name }) : t('providerUnavailable')}
        </button>
      </div>
    </section>
  )
}

/** "Conturi conectate": one card per network account, Instagram, Facebook, TikTok, YouTube. */
export function SettingsConnectionsSection({ connections }: { connections: SettingsConnectionsController; mobile: boolean }) {
  if (!connections.data) return <SettingsLoadState error={connections.error} onRetry={connections.reload} />
  return (
    <div className={styles.grid} data-settings-connections="">
      {connectionCards(connections.data).map((card) =>
        card.account ? (
          <ConnectedCard key={card.account.id} {...card} account={card.account} connections={connections} />
        ) : (
          <EmptyCard key={card.provider.id} {...card} connections={connections} />
        )
      )}
    </div>
  )
}
