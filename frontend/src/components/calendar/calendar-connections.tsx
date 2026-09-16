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
import { withAllPublishingProviders } from '@/lib/publishing'
import { Check, Loader2, Lock, LogOut, RefreshCw } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

const CONNECTION_EFFECTS = {
  instagram: '/brand/instagram-connected-effect.svg',
  facebook: '/brand/facebook-connected-effect.svg',
  tiktok: '/brand/tiktok-connected-effect.svg',
  youtube: '/brand/youtube-connected-effect.svg',
  linkedin: '/brand/Share%20on%20Linkedin.svg',
  twitter: '/brand/X%20Twitter%20logo.svg'
} as const

const PENDING_CONNECTION_KEY = 'sneepcut:pending-social-connection'

type AnimatedProvider = keyof typeof CONNECTION_EFFECTS

function isAnimatedProvider(value: string | null): value is AnimatedProvider {
  return (
    value === 'instagram' ||
    value === 'facebook' ||
    value === 'tiktok' ||
    value === 'youtube' ||
    value === 'linkedin' ||
    value === 'twitter'
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
  const [successAnimationReady, setSuccessAnimationReady] = useState(false)
  const connectedAccounts =
    data?.accounts.filter(
      (account) =>
        account.status === 'connected' && account.tokenExpired !== true
    ) ?? []

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.has('connectionError')) {
      window.sessionStorage.removeItem(PENDING_CONNECTION_KEY)
      return
    }
    const connectedProvider =
      params.get('connected') ??
      window.sessionStorage.getItem(PENDING_CONNECTION_KEY)
    if (!isAnimatedProvider(connectedProvider)) return

    setSuccessAnimationReady(false)
    setSuccessProvider(connectedProvider)
    window.sessionStorage.removeItem(PENDING_CONNECTION_KEY)
    params.delete('connected')
    const query = params.toString()
    window.history.replaceState(
      window.history.state,
      '',
      `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`
    )
  }, [])

  useEffect(() => {
    if (!successProvider || !successAnimationReady) return
    const timeout = window.setTimeout(() => {
      setSuccessProvider(null)
      setSuccessAnimationReady(false)
      onReload()
    }, 3000)
    return () => window.clearTimeout(timeout)
  }, [onReload, successAnimationReady, successProvider])

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
      window.sessionStorage.setItem(PENDING_CONNECTION_KEY, provider)
      window.location.assign(result.url)
    } catch {
      window.sessionStorage.removeItem(PENDING_CONNECTION_KEY)
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
    <Card
      as="aside"
      className="relative block min-w-0 gap-0 overflow-hidden bg-[#f5f6f7] p-0 shadow-none dark:bg-muted/30"
    >
      {successProvider &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-background/55 backdrop-blur-md animate-in fade-in duration-300 motion-reduce:animate-none"
            role="status"
            aria-live="polite"
            aria-label={t('connected')}
          >
            <div className="flex flex-col items-center gap-3">
              <img
                key={successProvider}
                src={CONNECTION_EFFECTS[successProvider]}
                alt=""
                width={240}
                height={240}
                className="size-60 max-h-[70vh] max-w-[70vw]"
                onLoad={() => setSuccessAnimationReady(true)}
                onError={() => setSuccessAnimationReady(true)}
              />
              <p className="text-sm font-semibold text-foreground">
                {t('connected')}
              </p>
            </div>
          </div>,
          document.body
        )}
      <div className="px-4 pb-2 pt-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
              {t('eyebrow')}
            </p>
            <h2 className="mt-1 text-base font-semibold tracking-tight">
              {t('title')}
            </h2>
          </div>
          {data && (
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-medium tabular-nums text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-300">
              <span className="size-1.5 rounded-full bg-emerald-500" />
              {t('summary', { count: connectedAccounts.length })}
            </span>
          )}
        </div>
      </div>

      <div className="p-3">
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
            {(
              [
                'instagram',
                'facebook',
                'tiktok',
                'youtube',
                'linkedin',
                'twitter'
              ] as const
            ).map((provider) => (
              <div key={provider} className="skeleton h-14 w-full rounded-md" />
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {withAllPublishingProviders(data.providers).map((provider) => {
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
                  className="relative rounded-md bg-white px-3 py-2.5 shadow-[0_2px_7px_-5px_rgba(15,23,42,0.28)] dark:bg-background dark:shadow-[0_2px_8px_-5px_rgba(0,0,0,0.65)]"
                >
                  <div className="min-w-0">
                    <div className="flex min-h-10 items-center gap-3">
                      <span className="relative flex size-10 shrink-0 items-center justify-center">
                        <PlatformBrandIcon
                          provider={provider.id}
                          className="size-10"
                        />
                      </span>
                      <p className="truncate text-xs font-semibold">
                        {provider.name}
                      </p>
                      {connected && successProvider !== provider.id && (
                        <span
                          className="ml-auto inline-flex size-6 shrink-0 animate-in items-center justify-center rounded-full bg-emerald-50 text-emerald-600 zoom-in-50 motion-reduce:animate-none dark:bg-emerald-950 dark:text-emerald-300"
                          title={t('connected')}
                        >
                          <Check className="size-3" />
                        </span>
                      )}
                      {!connected && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={
                            !provider.configured || busyProvider !== null
                          }
                          onClick={() => void connect(provider.id)}
                          className="ml-auto h-8 rounded-md bg-background px-2.5 text-[10px] shadow-none hover:bg-muted hover:text-foreground"
                        >
                          {busyProvider === provider.id ? (
                            <Loader2 className="size-3 animate-spin" />
                          ) : provider.configured ? (
                            <span aria-hidden="true">+</span>
                          ) : (
                            <Lock className="size-3" />
                          )}
                          {provider.configured
                            ? t('connect')
                            : t('unavailable')}
                        </Button>
                      )}
                    </div>
                    {connected && successProvider !== provider.id ? (
                      <div className="mt-2 border-t border-border/70">
                        {accounts.map((account) => (
                          <div
                            key={account.id}
                            className="flex min-w-0 items-center gap-2 border-b border-border/60 py-2 last:border-b-0"
                          >
                            <span className="flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-foreground text-[10px] font-semibold uppercase text-background">
                              {account.avatarUrl ? (
                                <img
                                  src={account.avatarUrl}
                                  alt=""
                                  className="h-full w-full object-cover"
                                  loading="lazy"
                                />
                              ) : (
                                (account.name || account.username || '?')
                                  .trim()
                                  .charAt(0)
                              )}
                            </span>
                            <p
                              className="min-w-0 flex-1 truncate text-[10px] text-muted-foreground"
                              title={account.username || account.name}
                            >
                              {account.username
                                ? `@${account.username.replace(/^@/, '')}`
                                : account.name}
                            </p>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-xs"
                              className="text-destructive hover:bg-destructive/5 hover:text-destructive"
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
                    ) : null}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

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
