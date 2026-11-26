'use client'

import { PlatformBrandIcon } from '@/components/publishing/platform-brand-icon'
import { OverlayTitle } from '@/components/shared/reference-overlay'
import overlay from '@/components/shared/reference-ui.module.css'
import {
  isPublishingAccountUsable,
  type PublishingAccount,
  type PublishingProvider
} from '@/lib/publishing'
import { useLocale, useTranslations } from 'next-intl'
import { useState } from 'react'
import { localizeHref } from '@/i18n/navigation'
import styles from './calendar-account-panel.module.css'

/** The sheet needs a dialog title for assistive technology; the popover shows a plain heading. */
function PanelTitle({ mobile, children }: { mobile: boolean; children: string }) {
  return mobile ? (
    <OverlayTitle mobile>{children}</OverlayTitle>
  ) : (
    <h2 className={styles.title}>{children}</h2>
  )
}

/** Consent checkbox YouTube requires before its connection can start. */
export function YouTubeConsent({
  checked,
  onChange
}: {
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  const t = useTranslations('contentCalendar.connections')
  const locale = useLocale()
  return (
    <label className={styles.consent}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>
        {t.rich('youtubeConsent', {
          terms: (chunks) => (
            <a
              href="https://www.youtube.com/t/terms"
              target="_blank"
              rel="noreferrer"
            >
              {chunks}
            </a>
          ),
          privacy: (chunks) => (
            <a
              href={localizeHref('/privacy', locale)}
              target="_blank"
              rel="noreferrer"
            >
              {chunks}
            </a>
          )
        })}
      </span>
    </label>
  )
}

/**
 * One provider's connection state: connect when nothing is linked, otherwise each
 * account with its disconnect and reconnect actions. Disconnect is confirmed by the parent.
 */
export function CalendarAccountPanel({
  provider,
  providerName,
  accounts,
  mobile,
  busyProvider,
  unavailable,
  needsConsent,
  onConnect,
  onRequestDisconnect
}: {
  provider: PublishingProvider
  providerName: string
  accounts: PublishingAccount[]
  mobile: boolean
  busyProvider: PublishingProvider | null
  unavailable: boolean
  needsConsent: boolean
  onConnect: (
    provider: PublishingProvider,
    providerConsent?: boolean
  ) => Promise<void>
  onRequestDisconnect: (account: PublishingAccount) => void
}) {
  const t = useTranslations('contentCalendar.connections')
  const [consent, setConsent] = useState(false)
  const connected = accounts.some(isPublishingAccountUsable)
  const busy = busyProvider !== null
  const connectBlocked = unavailable || busy || (needsConsent && !consent)
  const providerConsent = needsConsent && consent

  return (
    <div className={styles.panel} data-account-panel={provider}>
      <div className={styles.head}>
        <PlatformBrandIcon provider={provider} className={styles.brand} />
        <PanelTitle mobile={mobile}>
          {connected || accounts.length > 0
            ? providerName
            : t('connectTitle', { provider: providerName })}
        </PanelTitle>
      </div>
      {accounts.length === 0 && needsConsent && (
        <YouTubeConsent checked={consent} onChange={setConsent} />
      )}
      {accounts.length === 0 && (
        <div className={styles.actions}>
          <button
            type="button"
            className={`${overlay.button} ${overlay.primary} ${overlay.focus}`}
            disabled={connectBlocked}
            onClick={() => void onConnect(provider, providerConsent)}
          >
            {unavailable ? t('unavailable') : t('connectProvider', { provider: providerName })}
          </button>
        </div>
      )}
      {accounts.map((account) => {
        const usable = isPublishingAccountUsable(account)
        return (
          <div key={account.id} className={styles.account}>
            <div className={styles.accountInfo}>
              <span className={styles.accountName}>{account.name}</span>
              {account.username && (
                <span className={styles.handle}>
                  @{account.username.replace(/^@/, '')}
                </span>
              )}
            </div>
            <span
              className={styles.status}
              data-state={usable ? 'connected' : 'reconnect'}
            >
              <span aria-hidden="true" />
              {usable ? t('connected') : t('reconnect')}
            </span>
            <div className={styles.actions}>
              <button
                type="button"
                className={`${overlay.button} ${overlay.secondary} ${overlay.focus} ${styles.disconnect}`}
                disabled={busy}
                aria-label={t('disconnectAccount', {
                  account: account.username || account.name
                })}
                onClick={() => onRequestDisconnect(account)}
              >
                {t('disconnect')}
              </button>
              <button
                type="button"
                className={`${overlay.button} ${overlay.secondary} ${overlay.focus}`}
                disabled={connectBlocked}
                onClick={() => void onConnect(provider, providerConsent)}
              >
                {t('reconnect')}
              </button>
            </div>
          </div>
        )
      })}
      {accounts.length > 0 && needsConsent && (
        <YouTubeConsent checked={consent} onChange={setConsent} />
      )}
    </div>
  )
}
