'use client'

import { PlatformBrandIcon } from '@/components/publishing/platform-brand-icon'
import { LoadingIndicator } from '@/components/ui/loading-indicator'
import { useIsMobile } from '@/hooks/use-mobile'
import {
  isPublishingAccountUsable,
  withAllPublishingProviders,
  type PublishingData,
  type PublishingProvider
} from '@/lib/publishing'
import { Check, LogOut, RefreshCw } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useAccountDisconnect } from './calendar-account-disconnect'
import { DisconnectConfirmation } from './calendar-disconnect-confirmation'
import { YouTubeConsent } from './calendar-account-panel'
import styles from './calendar-publishing.module.css'

/** Every network with its connection state; used when no account is connected yet. */
export function CalendarConnections({
  data,
  error,
  onReload,
  onConnect,
  busyProvider
}: {
  data: PublishingData | null
  error: string | null
  onReload: () => void
  onConnect: (
    provider: PublishingProvider,
    providerConsent?: boolean
  ) => Promise<void>
  busyProvider: PublishingProvider | null
}) {
  const t = useTranslations('contentCalendar.connections')
  const mobile = useIsMobile()
  const [youtubeConsent, setYouTubeConsent] = useState(false)
  const disconnect = useAccountDisconnect(onReload)

  if (error) {
    return (
      <div className="space-y-3 text-sm text-muted-foreground" role="alert">
        <p>{t('loadError')}</p>
        <Button type="button" variant="outline" size="sm" onClick={onReload}>
          <RefreshCw />
          {t('retry')}
        </Button>
      </div>
    )
  }
  if (!data) {
    return (
      <div className="space-y-3" aria-busy="true">
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="skeleton h-14 rounded-md" />
        ))}
      </div>
    )
  }

  return (
    <div className="min-w-0">
      <div className={`${styles.connectionRows} divide-y divide-border`}>
        {withAllPublishingProviders(data.providers).map((provider) => {
          const accounts = data.accounts.filter(
            (account) => account.provider === provider.id
          )
          const connected = accounts.some(isPublishingAccountUsable)
          const needsConsent =
            provider.id === 'youtube' &&
            (accounts.length === 0 ||
              accounts.some((account) => !isPublishingAccountUsable(account)))
          const unavailable = !provider.configured
          const connectDisabled =
            unavailable ||
            busyProvider !== null ||
            disconnect.busy ||
            (needsConsent && !youtubeConsent)
          const connect = () =>
            void onConnect(provider.id, needsConsent && youtubeConsent)
          return (
            <div key={provider.id} className="py-3 first:pt-0 last:pb-0">
              <div className="flex min-h-10 items-center gap-3">
                <PlatformBrandIcon
                  provider={provider.id}
                  className={styles.connectionBrand}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{provider.name}</p>
                  {accounts.length === 1 && (
                    <p className="truncate text-xs text-muted-foreground">
                      {accounts[0].username
                        ? `@${accounts[0].username.replace(/^@/, '')}`
                        : accounts[0].name}
                    </p>
                  )}
                </div>
                {connected ? (
                  <Check
                    className={styles.connectedMark}
                    aria-label={t('connected')}
                  />
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    data-reconnect={accounts.length > 0}
                    disabled={connectDisabled}
                    onClick={connect}
                  >
                    {busyProvider === provider.id && (
                      <LoadingIndicator className="size-3" />
                    )}
                    {unavailable
                      ? t('unavailable')
                      : accounts.length
                        ? t('reconnect')
                        : t('connect')}
                  </Button>
                )}
                {accounts.length === 1 && connected && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    disabled={disconnect.busy}
                    onClick={() => disconnect.request(accounts[0])}
                    aria-label={t('disconnectAccount', {
                      account: accounts[0].username || accounts[0].name
                    })}
                  >
                    <LogOut className="size-3.5 text-muted-foreground" />
                  </Button>
                )}
              </div>
              {accounts.length > 1 && (
                <div className="mt-2 pl-11">
                  {accounts.map((account) => (
                    <div
                      key={account.id}
                      className="flex items-center gap-2 py-1.5"
                    >
                      <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                        {account.username
                          ? `@${account.username.replace(/^@/, '')}`
                          : account.name}
                      </p>
                      {!isPublishingAccountUsable(account) && (
                        <Button
                          type="button"
                          variant="outline"
                          size="xs"
                          data-reconnect="true"
                          disabled={connectDisabled}
                          onClick={connect}
                        >
                          {t('reconnect')}
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        disabled={disconnect.busy}
                        onClick={() => disconnect.request(account)}
                        aria-label={t('disconnectAccount', {
                          account: account.username || account.name
                        })}
                      >
                        <LogOut className="size-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              {needsConsent && (
                <div className="mt-3">
                  <YouTubeConsent
                    checked={youtubeConsent}
                    onChange={setYouTubeConsent}
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>
      <DisconnectConfirmation
        account={disconnect.account}
        providerName={
          disconnect.account
            ? (data.providers.find(
                (provider) => provider.id === disconnect.account?.provider
              )?.name ?? disconnect.account.provider)
            : ''
        }
        busy={disconnect.busy}
        mobile={mobile}
        onCancel={disconnect.cancel}
        onConfirm={() => void disconnect.confirm()}
      />
    </div>
  )
}
