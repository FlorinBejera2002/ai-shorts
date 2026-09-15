'use client'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useToast } from '@/components/ui/toast'
import { useApiResource } from '@/hooks/use-api-resource'
import { Link } from '@/i18n/navigation'
import { apiFetch } from '@/lib/auth'
import type { PublishingData, PublishingProvider } from '@/lib/publishing'
import { withAllPublishingProviders } from '@/lib/publishing'
import {
  ArrowRight,
  Facebook,
  Instagram,
  Linkedin,
  Loader2,
  Music2,
  RefreshCw,
  X,
  Youtube
} from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useState } from 'react'

const providerIcons = {
  instagram: Instagram,
  facebook: Facebook,
  tiktok: Music2,
  youtube: Youtube,
  linkedin: Linkedin,
  twitter: X
} satisfies Record<PublishingProvider, typeof Instagram>

export function ConnectedAccountsSettings() {
  const t = useTranslations('settings')
  const locale = useLocale()
  const toast = useToast()
  const [busy, setBusy] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)
  const { data, error, reload } =
    useApiResource<PublishingData>('/api/publishing')

  async function disconnect(id: string) {
    setBusy(id)
    try {
      const response = await apiFetch(`/api/publishing/accounts/${id}`, {
        method: 'DELETE'
      })
      if (!response.ok) throw new Error(t('connectionActionFailed'))
      setConfirming(null)
      reload()
      toast.add('success', t('connectionDisconnected'))
    } catch (caught) {
      toast.add(
        'error',
        caught instanceof Error ? caught.message : t('connectionActionFailed')
      )
    } finally {
      setBusy(null)
    }
  }

  async function reconnect(provider: PublishingProvider) {
    setBusy(provider)
    try {
      const response = await apiFetch(`/api/publishing/connect/${provider}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locale })
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok || typeof result.url !== 'string')
        throw new Error(t('connectionActionFailed'))
      window.location.assign(result.url)
    } catch (caught) {
      toast.add(
        'error',
        caught instanceof Error ? caught.message : t('connectionActionFailed')
      )
      setBusy(null)
    }
  }

  return (
    <Card
      as="section"
      className="order-5 min-w-0 block gap-0 p-4 sm:p-5"
      aria-labelledby="connections-title"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2
            id="connections-title"
            className="scroll-mt-24 text-sm font-medium"
          >
            {t('connections')}
          </h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {t('connectionsDesc')}
          </p>
        </div>
        <Button asChild={true} variant="outline" size="sm">
          <Link href="/dashboard/publish">
            {t('manageConnections')}
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </Link>
        </Button>
      </div>

      {!data ? (
        <div
          className="mt-5 flex min-h-24 items-center justify-center rounded-md border border-dashed border-border bg-muted/20 p-4"
          role={error ? 'alert' : 'status'}
        >
          {error ? (
            <div className="text-center">
              <p className="text-sm font-medium">{t('connectionsError')}</p>
              <p className="mt-1 text-xs text-muted-foreground">{error}</p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="mt-2"
                onClick={reload}
              >
                <RefreshCw className="size-3.5" aria-hidden="true" />
                {t('retry')}
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2
                className="size-4 animate-spin motion-reduce:animate-none"
                aria-hidden="true"
              />
              {t('connectionsLoading')}
            </div>
          )}
        </div>
      ) : (
        <ul className="mt-5 divide-y divide-border rounded-md border border-border">
          {withAllPublishingProviders(data.providers).map((provider) => {
            const Icon = providerIcons[provider.id]
            const accounts = data.accounts.filter(
              (account) => account.provider === provider.id
            )
            return (
              <li
                key={provider.id}
                className="flex flex-wrap items-center gap-3 px-4 py-3.5"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-foreground">
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{provider.name}</p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {accounts.length
                      ? accounts
                          .map((account) => account.username || account.name)
                          .join(', ')
                      : provider.configured
                        ? t('notConnected')
                        : t('providerUnavailable')}
                  </p>
                  {accounts.length > 0 && (
                    <div className="mt-2 space-y-2">
                      {accounts.map((account) => {
                        const expired = account.tokenExpired === true
                        return (
                          <div
                            key={account.id}
                            className="rounded-md bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground"
                          >
                            <div className="mb-2 min-w-0">
                              <p
                                className="truncate text-xs font-medium text-foreground"
                                title={account.name}
                              >
                                {account.name}
                              </p>
                              {account.username &&
                                account.username !== account.name && (
                                  <p
                                    className="mt-0.5 truncate"
                                    title={`@${account.username.replace(/^@/, '')}`}
                                  >
                                    @{account.username.replace(/^@/, '')}
                                  </p>
                                )}
                            </div>
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span>
                                {account.scopes?.length
                                  ? t('connectionPermissions', {
                                      permissions: account.scopes.join(', ')
                                    })
                                  : t('connectionPermissionsUnavailable')}
                              </span>
                              <span
                                className={
                                  expired ? 'text-destructive' : 'text-success'
                                }
                              >
                                {expired
                                  ? t('tokenExpired')
                                  : account.tokenExpiresAt
                                    ? t('tokenExpires', {
                                        date: account.tokenExpiresAt.slice(
                                          0,
                                          10
                                        )
                                      })
                                    : t('tokenActive')}
                              </span>
                            </div>
                            <div className="mt-2 flex flex-wrap gap-2">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => void reconnect(provider.id)}
                                disabled={busy !== null || !provider.configured}
                              >
                                {busy === provider.id && (
                                  <Loader2 className="size-3.5 animate-spin" />
                                )}
                                {t('reconnect')}
                              </Button>
                              {confirming === account.id ? (
                                <>
                                  <Button
                                    type="button"
                                    variant="destructive"
                                    size="sm"
                                    onClick={() => void disconnect(account.id)}
                                    disabled={busy !== null}
                                  >
                                    {busy === account.id && (
                                      <Loader2 className="size-3.5 animate-spin" />
                                    )}
                                    {t('confirmDisconnect')}
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setConfirming(null)}
                                    disabled={busy !== null}
                                  >
                                    {t('cancel')}
                                  </Button>
                                </>
                              ) : (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setConfirming(account.id)}
                                  disabled={busy !== null}
                                  className="text-destructive"
                                >
                                  {t('disconnect')}
                                </Button>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
                {!accounts.length && provider.configured && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void reconnect(provider.id)}
                    disabled={busy !== null}
                  >
                    {busy === provider.id && (
                      <Loader2 className="size-3.5 animate-spin" />
                    )}
                    {t('connect')}
                  </Button>
                )}
                <span
                  className={`inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1 text-[11px] font-semibold ${
                    accounts.length
                      ? 'bg-success/10 text-success'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  <span
                    className={`size-1.5 rounded-full ${accounts.length ? 'bg-success' : 'bg-muted-foreground/50'}`}
                    aria-hidden="true"
                  />
                  {accounts.length
                    ? t('connectedCount', { count: accounts.length })
                    : t('notConnected')}
                </span>
              </li>
            )
          })}
        </ul>
      )}
      <p className="mt-3 text-[11px] leading-5 text-muted-foreground">
        {t('connectionsHint')}
      </p>
    </Card>
  )
}
