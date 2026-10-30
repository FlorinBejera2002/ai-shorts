'use client'

import { PlatformBrandIcon } from '@/components/publishing/platform-brand-icon'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { LoadingIndicator } from '@/components/ui/loading-indicator'
import { Switch } from '@/components/ui/switch'
import { useToast } from '@/components/ui/toast'
import { extractApiError } from '@/lib/api-error'
import { apiFetch } from '@/lib/auth'
import {
  isPublishingAccountUsable,
  withAllPublishingProviders,
  type PublishingAccount,
  type PublishingData,
  type PublishingProvider
} from '@/lib/publishing'
import { Check, LogOut, RefreshCw } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useState } from 'react'
import styles from './calendar-publishing.module.css'
import theme from './publishing-theme.module.css'

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
  const locale = useLocale()
  const youtubeT = useTranslations('youtubePublishing')
  const [youtubeConsent, setYouTubeConsent] = useState(false)
  const toast = useToast()
  const [busyAccount, setBusyAccount] = useState<string | null>(null)
  const [disconnectingAccount, setDisconnectingAccount] =
    useState<PublishingAccount | null>(null)

  async function disconnect() {
    if (!disconnectingAccount || busyAccount) return
    setBusyAccount(disconnectingAccount.id)
    try {
      const response = await apiFetch(
        `/api/publishing/accounts/${disconnectingAccount.id}`,
        { method: 'DELETE' }
      )
      const result = (await response.json().catch(() => ({}))) as Record<
        string,
        unknown
      >
      if (!response.ok)
        throw new Error(extractApiError(result, t('disconnectFailed')))
      setDisconnectingAccount(null)
      onReload()
      toast.add('success', t('disconnected'))
    } catch (caught) {
      toast.add(
        'error',
        caught instanceof Error ? caught.message : t('disconnectFailed')
      )
    } finally {
      setBusyAccount(null)
    }
  }

  return (
    <div className="min-w-0">
      {error ? (
        <div className="space-y-3 text-sm text-muted-foreground" role="alert">
          <p>{t('loadError')}</p>
          <Button type="button" variant="outline" size="sm" onClick={onReload}>
            <RefreshCw />
            {t('retry')}
          </Button>
        </div>
      ) : !data ? (
        <div className="space-y-3" aria-busy="true">
          {[0, 1, 2, 3].map((index) => (
            <div key={index} className="skeleton h-14 rounded-md" />
          ))}
        </div>
      ) : (
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
                      disabled={
                        unavailable ||
                        busyProvider !== null ||
                        busyAccount !== null ||
                        (needsConsent && !youtubeConsent)
                      }
                      onClick={() =>
                        void onConnect(
                          provider.id,
                          needsConsent && youtubeConsent
                        )
                      }
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
                      disabled={busyAccount !== null}
                      onClick={() => setDisconnectingAccount(accounts[0])}
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
                            disabled={
                              busyProvider !== null ||
                              (needsConsent && !youtubeConsent)
                            }
                            onClick={() =>
                              void onConnect(
                                provider.id,
                                needsConsent && youtubeConsent
                              )
                            }
                          >
                            {t('reconnect')}
                          </Button>
                        )}
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          disabled={busyAccount !== null}
                          onClick={() => setDisconnectingAccount(account)}
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
                  <label className="mt-3 flex items-start gap-2 text-xs leading-5 text-muted-foreground">
                    <Switch
                      checked={youtubeConsent}
                      onCheckedChange={setYouTubeConsent}
                    />
                    <span>
                      {youtubeT.rich('connectionConsent', {
                        terms: (chunks) => (
                          <a
                            className="underline"
                            href="https://www.youtube.com/t/terms"
                            target="_blank"
                            rel="noreferrer"
                          >
                            {chunks}
                          </a>
                        ),
                        privacy: (chunks) => (
                          <a
                            className="underline"
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
                )}
              </div>
            )
          })}
        </div>
      )}
      <Dialog
        open={disconnectingAccount !== null}
        onOpenChange={(open) => {
          if (!open && busyAccount === null) setDisconnectingAccount(null)
        }}
      >
        <DialogContent
          className={`${theme.surface} ${styles.confirmationDialog}`}
          overlayClassName={theme.overlay}
          data-publish-surface=""
        >
          <DialogHeader>
            {disconnectingAccount && (
              <PlatformBrandIcon
                provider={disconnectingAccount.provider}
                className={styles.disconnectProvider}
              />
            )}
            <DialogTitle>{t('disconnectTitle')}</DialogTitle>
            <DialogDescription>
              {disconnectingAccount
                ? t('disconnectDescription', {
                    account:
                      disconnectingAccount.username ||
                      disconnectingAccount.name,
                    provider:
                      data?.providers.find(
                        (provider) =>
                          provider.id === disconnectingAccount.provider
                      )?.name ?? disconnectingAccount.provider
                  })
                : ''}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={busyAccount !== null}
              onClick={() => setDisconnectingAccount(null)}
            >
              {t('cancel')}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={busyAccount !== null}
              onClick={() => void disconnect()}
            >
              {busyAccount !== null && <LoadingIndicator />}
              {t('confirmDisconnect')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
