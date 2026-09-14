'use client'

import { PlatformBrandIcon } from '@/components/publishing/platform-brand-icon'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { useToast } from '@/components/ui/toast'
import { extractApiError } from '@/lib/api-error'
import { apiFetch } from '@/lib/auth'
import type {
  PublishingAccount,
  PublishingData,
  PublishingProvider
} from '@/lib/publishing'
import { Check, ExternalLink, Loader2, LogOut, RefreshCw } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import Image from 'next/image'
import { useEffect, useState } from 'react'

const YOUTUBE_PROVIDER: PublishingData['providers'][number] = {
  id: 'youtube',
  name: 'YouTube',
  configured: false,
  supportsPublishing: false
}

const CONNECTION_EFFECTS = {
  instagram: '/brand/instagram-connected-effect.svg',
  facebook: '/brand/facebook-connected-effect.svg',
  tiktok: '/brand/tiktok-connected-effect.svg',
  youtube: '/brand/youtube-connected-effect.svg'
} as const

type AnimatedProvider = keyof typeof CONNECTION_EFFECTS

function isAnimatedProvider(value: string | null): value is AnimatedProvider {
  return (
    value === 'instagram' ||
    value === 'facebook' ||
    value === 'tiktok' ||
    value === 'youtube'
  )
}

export function CalendarConnections({
  data,
  error,
  onReload
}: {
  data: PublishingData | null
  error: string | null
  onReload: () => void
}) {
  const t = useTranslations('contentCalendar.connections')
  const locale = useLocale()
  const toast = useToast()
  const [busyProvider, setBusyProvider] = useState<PublishingProvider | null>(
    null
  )
  const [busyAccount, setBusyAccount] = useState<string | null>(null)
  const [disconnectingAccount, setDisconnectingAccount] =
    useState<PublishingAccount | null>(null)
  const [successProvider, setSuccessProvider] =
    useState<AnimatedProvider | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const connectedProvider = params.get('connected')
    if (!isAnimatedProvider(connectedProvider)) return

    setSuccessProvider(connectedProvider)
    params.delete('connected')
    const query = params.toString()
    window.history.replaceState(
      window.history.state,
      '',
      `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`
    )
  }, [])

  useEffect(() => {
    if (!data || !successProvider) return
    const timeout = window.setTimeout(() => setSuccessProvider(null), 2600)
    return () => window.clearTimeout(timeout)
  }, [data, successProvider])

  async function connect(provider: PublishingProvider) {
    setBusyProvider(provider)
    try {
      const response = await apiFetch(`/api/publishing/connect/${provider}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locale })
      })
      const result: unknown = await response.json().catch(() => null)
      if (
        !response.ok ||
        typeof result !== 'object' ||
        result === null ||
        !('url' in result) ||
        typeof result.url !== 'string'
      ) {
        throw new Error('Unable to start connection')
      }
      window.location.assign(result.url)
    } catch {
      setBusyProvider(null)
    }
  }

  async function disconnect() {
    if (!disconnectingAccount) return

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
      if (!response.ok) {
        throw new Error(extractApiError(result, t('disconnectFailed')))
      }

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
    <Card as="aside" className="block min-w-0 gap-0 p-4 shadow-none">
      <div className="mb-3">
        <h2 className="text-sm font-semibold">{t('title')}</h2>
      </div>

      {error ? (
        <div className="rounded-md bg-muted/45 p-3 text-xs text-muted-foreground">
          <p>{t('loadError')}</p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mt-2"
            onClick={onReload}
          >
            <RefreshCw className="size-3.5" />
            {t('retry')}
          </Button>
        </div>
      ) : !data ? (
        <div className="space-y-2" aria-busy="true">
          {(['instagram', 'facebook', 'tiktok', 'youtube'] as const).map(
            (provider) => (
              <div key={provider} className="skeleton h-14 w-full rounded-md" />
            )
          )}
        </div>
      ) : (
        <div className="space-y-1.5">
          {(data.providers.some((provider) => provider.id === 'youtube')
            ? data.providers
            : [...data.providers, YOUTUBE_PROVIDER]
          ).map((provider) => {
            const accounts = data.accounts.filter(
              (account) =>
                account.provider === provider.id &&
                account.status === 'connected' &&
                account.tokenExpired !== true
            )
            const connected = accounts.length > 0
            return (
              <div
                key={provider.id}
                className="flex items-start gap-3 rounded-md px-2.5 py-2.5 transition-colors hover:bg-muted/55"
              >
                <span className="relative flex size-9 shrink-0 items-center justify-center">
                  {successProvider === provider.id &&
                  isAnimatedProvider(provider.id) ? (
                    <Image
                      src={CONNECTION_EFFECTS[provider.id]}
                      alt=""
                      width={64}
                      height={64}
                      unoptimized={true}
                      className="absolute max-w-none"
                    />
                  ) : (
                    <PlatformBrandIcon
                      provider={provider.id}
                      className="size-9"
                    />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex min-h-7 items-center justify-between gap-2">
                    <p className="truncate text-xs font-semibold">
                      {provider.name}
                    </p>
                    {connected && (
                      <span
                        className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-foreground text-background"
                        title={t('connected')}
                      >
                        <Check className="size-3" />
                      </span>
                    )}
                  </div>
                  {connected ? (
                    <div className="mt-1.5 space-y-1">
                      {accounts.map((account) => (
                        <div
                          key={account.id}
                          className="flex min-w-0 items-center gap-2 rounded-sm bg-muted/55 px-2 py-1.5"
                        >
                          <div className="min-w-0 flex-1">
                            <p
                              className="truncate text-[11px] font-medium text-foreground"
                              title={account.name}
                            >
                              {account.name}
                            </p>
                            {account.username &&
                              account.username !== account.name && (
                                <p
                                  className="truncate text-[10px] text-muted-foreground"
                                  title={`@${account.username.replace(/^@/, '')}`}
                                >
                                  @{account.username.replace(/^@/, '')}
                                </p>
                              )}
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                            disabled={busyAccount !== null}
                            onClick={() => setDisconnectingAccount(account)}
                            aria-label={t('disconnectAccount', {
                              account: account.username || account.name
                            })}
                            title={t('disconnect')}
                          >
                            {busyAccount === account.id ? (
                              <Loader2 className="animate-spin" />
                            ) : (
                              <LogOut />
                            )}
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      {t('notConnected')}
                    </p>
                  )}
                </div>
                {!connected && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!provider.configured || busyProvider !== null}
                    onClick={() => void connect(provider.id)}
                    className="h-8 px-2.5 text-[10px]"
                  >
                    {busyProvider === provider.id ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <ExternalLink className="size-3" />
                    )}
                    {provider.configured ? t('connect') : t('unavailable')}
                  </Button>
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
        <DialogContent className="rounded-md">
          <DialogHeader>
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
              {busyAccount !== null && <Loader2 className="animate-spin" />}
              {t('confirmDisconnect')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
