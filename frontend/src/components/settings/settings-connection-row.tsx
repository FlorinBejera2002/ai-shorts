'use client'

import { PlatformBrandIcon } from '@/components/publishing/platform-brand-icon'
import { Button } from '@/components/ui/button'
import { LoadingIndicator } from '@/components/ui/loading-indicator'
import type { PublishingAccount, PublishingData } from '@/lib/publishing'
import { CircleAlert } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'

interface SettingsConnectionRowProps {
  provider: PublishingData['providers'][number]
  account: PublishingAccount | null
  disabled: boolean
  busy: boolean
  confirming: boolean
  consentOpen: boolean
  youtubeConsent: boolean
  error: string | null
  onConnect: () => void
  onConfirmConnect: () => void
  onConsentChange: (checked: boolean) => void
  onCancelConsent: () => void
  onDisconnect: () => void
  onConfirmDisconnect: () => void
  onCancelDisconnect: () => void
}

export function SettingsConnectionRow({
  provider,
  account,
  disabled,
  busy,
  confirming,
  consentOpen,
  youtubeConsent,
  error,
  onConnect,
  onConfirmConnect,
  onConsentChange,
  onCancelConsent,
  onDisconnect,
  onConfirmDisconnect,
  onCancelDisconnect
}: SettingsConnectionRowProps) {
  const t = useTranslations('settings')
  const design = useTranslations('settings.connectionsDesign')
  const youtube = useTranslations('youtubePublishing')
  const locale = useLocale()
  const expired = account?.tokenExpired === true
  const connected = account?.status === 'connected'
  const status = !provider.configured
    ? 'unconfigured'
    : expired
      ? 'expired'
      : connected
        ? 'connected'
        : 'disconnected'
  const rowId = account?.id ?? provider.id
  const expiresAt = account?.tokenExpiresAt
    ? new Date(account.tokenExpiresAt)
    : null
  const expiryDate =
    expiresAt && !Number.isNaN(expiresAt.getTime())
      ? new Intl.DateTimeFormat(locale, {
          day: 'numeric',
          month: 'short',
          year: 'numeric'
        }).format(expiresAt)
      : null
  const authorization = !account
    ? '—'
    : expired
      ? expiryDate
        ? design('expiredOn', { date: expiryDate })
        : t('tokenExpired')
      : expiryDate
        ? design('activeExpires', { date: expiryDate })
        : t('tokenActive')

  return (
    <article
      className="settings-connection"
      data-settings-account={account?.id}
      data-settings-connection-account={account?.id}
      aria-busy={busy}
    >
      <PlatformBrandIcon
        provider={provider.id}
        className="settings-connection__mark"
      />
      <div className="settings-connection__body">
        <div className="settings-connection__identity">
          <h3>{provider.name}</h3>
          <p
            className="settings-connection__status"
            data-connection-status={status}
          >
            <span
              className="settings-connection__status-dot"
              aria-hidden="true"
            />
            {!provider.configured
              ? design('unconfigured')
              : expired
                ? t('tokenExpired')
                : connected
                  ? design('connected')
                  : t('notConnected')}
          </p>
          {account ? (
            <div className="settings-connection__account-name">
              <p>{account.name}</p>
              {account.username && account.username !== account.name && (
                <p className="text-muted-foreground">
                  @{account.username.replace(/^@/, '')}
                </p>
              )}
              {!provider.configured && (
                <p className="text-muted-foreground">
                  {t('providerUnavailable')}
                </p>
              )}
            </div>
          ) : (
            <p className="settings-connection__hint">
              {provider.configured
                ? design('connectHint')
                : t('providerUnavailable')}
            </p>
          )}
        </div>

        <dl
          className={
            'settings-connection__authorization' +
            (account ? '' : ' settings-connection__authorization--empty')
          }
        >
          <div>
            <dt>{design('permissions')}</dt>
            <dd>{account?.scopes?.length ? account.scopes.join(', ') : '—'}</dd>
          </div>
          <div>
            <dt>{design('authorization')}</dt>
            <dd>{authorization}</dd>
          </div>
        </dl>

        {!confirming && !consentOpen && (
          <div className="settings-connection__actions">
            {account ? (
              <>
                <Button
                  type="button"
                  variant={expired ? 'default' : 'outline'}
                  className={
                    expired
                      ? 'settings-connections__primary'
                      : 'settings-connections__secondary'
                  }
                  disabled={disabled || !provider.configured}
                  onClick={onConnect}
                  data-settings-reconnect={account.id}
                >
                  {busy && <LoadingIndicator className="size-4" />}
                  {t('reconnect')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="settings-connections__secondary"
                  disabled={disabled}
                  onClick={onDisconnect}
                  data-settings-disconnect={account.id}
                >
                  {t('disconnect')}
                </Button>
              </>
            ) : (
              provider.configured && (
                <Button
                  type="button"
                  className="settings-connections__primary"
                  disabled={disabled}
                  onClick={onConnect}
                  data-settings-connect={provider.id}
                >
                  {busy && <LoadingIndicator className="size-4" />}
                  {t('connect')}
                </Button>
              )
            )}
          </div>
        )}
      </div>

      {confirming && account && (
        <section
          className="settings-connection__confirmation"
          aria-labelledby={'disconnect-title-' + rowId}
          data-settings-disconnect-confirm={rowId}
        >
          <h4 id={'disconnect-title-' + rowId}>
            {design('disconnectTitle', { provider: provider.name })}
          </h4>
          <p>{design('disconnectHint')}</p>
          {error && (
            <p
              className="settings-connections__error"
              role="alert"
              data-settings-connection-error
            >
              <CircleAlert className="size-4" aria-hidden="true" />
              {error}
            </p>
          )}
          <div className="settings-connection__confirmation-actions">
            <Button
              type="button"
              variant="outline"
              className="settings-connections__destructive"
              disabled={disabled}
              onClick={onConfirmDisconnect}
              data-settings-confirm-disconnect={account.id}
            >
              {busy && <LoadingIndicator className="size-4" />}
              {t('confirmDisconnect')}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="settings-connections__secondary"
              disabled={disabled}
              onClick={onCancelDisconnect}
              data-settings-cancel-disconnect={account.id}
            >
              {t('cancel')}
            </Button>
          </div>
        </section>
      )}

      {consentOpen && (
        <section
          className="settings-connection__confirmation"
          aria-labelledby={'connect-title-' + rowId}
          data-settings-youtube-consent
        >
          <h4 id={'connect-title-' + rowId}>{design('youtubeConsentTitle')}</h4>
          <label className="settings-connection__consent">
            <input
              type="checkbox"
              checked={youtubeConsent}
              onChange={(event) => onConsentChange(event.target.checked)}
              disabled={disabled}
              data-settings-youtube-consent-check
            />
            <span>
              {youtube.rich('connectionConsent', {
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
                    href={locale === 'ro' ? '/ro/privacy' : '/privacy'}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {chunks}
                  </a>
                )
              })}
            </span>
          </label>
          <div className="settings-connection__confirmation-actions">
            <Button
              type="button"
              className="settings-connections__primary"
              disabled={disabled || !youtubeConsent}
              onClick={onConfirmConnect}
              data-settings-confirm-connect="youtube"
            >
              {account ? t('reconnect') : t('connect')}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="settings-connections__secondary"
              disabled={disabled}
              onClick={onCancelConsent}
            >
              {t('cancel')}
            </Button>
          </div>
        </section>
      )}
    </article>
  )
}
