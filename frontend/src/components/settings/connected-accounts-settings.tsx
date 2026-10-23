'use client'

import { ConnectionSuccessOverlay } from '@/components/calendar/connection-success-overlay'
import { Button } from '@/components/ui/button'
import { LoadingIndicator } from '@/components/ui/loading-indicator'
import { useToast } from '@/components/ui/toast'
import type { useApiResource } from '@/hooks/use-api-resource'
import type { useSocialConnection } from '@/hooks/use-social-connection'
import { Link } from '@/i18n/navigation'
import { extractApiError } from '@/lib/api-error'
import { apiFetch } from '@/lib/auth'
import type { PublishingData, PublishingProvider } from '@/lib/publishing'
import { withAllPublishingProviders } from '@/lib/publishing'
import { ArrowRight, CircleAlert } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useRef, useState } from 'react'
import { SettingsConnectionRow } from './settings-connection-row'
import './settings-connections.css'

interface ConnectedAccountsSettingsProps {
  resource: ReturnType<typeof useApiResource<PublishingData>>
  connection: ReturnType<typeof useSocialConnection>
  disabled?: boolean
  onBusyChange?: (busy: boolean) => void
  acquireMutation?: () => boolean
  releaseMutation?: () => void
}

export function ConnectedAccountsSettings({
  resource,
  connection,
  disabled = false,
  onBusyChange,
  acquireMutation,
  releaseMutation
}: ConnectedAccountsSettingsProps) {
  const t = useTranslations('settings')
  const design = useTranslations('settings.connectionsDesign')
  const toast = useToast()
  const [busyAccount, setBusyAccount] = useState<string | null>(null)
  const [startingProvider, setStartingProvider] =
    useState<PublishingProvider | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)
  const [consentRow, setConsentRow] = useState<string | null>(null)
  const [youtubeConsent, setYouTubeConsent] = useState(false)
  const [actionError, setActionError] = useState<{
    accountId: string
    message: string
  } | null>(null)
  const actionLock = useRef(false)
  const { data, error, reload } = resource
  const { connect, busyProvider, connectedProvider, finishConfirmation } =
    connection
  const busy =
    busyAccount !== null || startingProvider !== null || busyProvider !== null
  const controlsDisabled = disabled || busy

  function beginConnection(provider: PublishingProvider, rowId: string) {
    if (disabled || actionLock.current || busyProvider) return
    setConfirming(null)
    setActionError(null)
    if (provider === 'youtube') {
      setConsentRow(rowId)
      setYouTubeConsent(false)
      return
    }
    void connectProvider(provider)
  }

  async function connectProvider(provider: PublishingProvider) {
    if (
      disabled ||
      actionLock.current ||
      busyProvider ||
      (provider === 'youtube' && !youtubeConsent)
    )
      return
    if (acquireMutation && !acquireMutation()) return
    actionLock.current = true
    onBusyChange?.(true)
    setStartingProvider(provider)
    setConsentRow(null)
    try {
      await connect(provider, provider === 'youtube' && youtubeConsent)
    } catch {
      setActionError({
        accountId: provider,
        message: t('connectionActionFailed')
      })
    }
    setStartingProvider(null)
    actionLock.current = false
    onBusyChange?.(false)
    releaseMutation?.()
  }

  async function disconnect(id: string) {
    if (disabled || actionLock.current || busyProvider) return
    if (acquireMutation && !acquireMutation()) return
    actionLock.current = true
    onBusyChange?.(true)
    setBusyAccount(id)
    setActionError(null)
    try {
      const response = await apiFetch('/api/publishing/accounts/' + id, {
        method: 'DELETE'
      })
      const result: unknown = await response.json().catch(() => null)
      const errorData =
        result && typeof result === 'object' && !Array.isArray(result)
          ? (result as Record<string, unknown>)
          : {}
      if (!response.ok)
        throw new Error(extractApiError(errorData, t('connectionActionFailed')))
      setConfirming(null)
      reload()
      toast.add('success', t('connectionDisconnected'))
    } catch (caught) {
      setActionError({
        accountId: id,
        message:
          caught instanceof Error ? caught.message : t('connectionActionFailed')
      })
    }
    setBusyAccount(null)
    actionLock.current = false
    onBusyChange?.(false)
    releaseMutation?.()
  }

  return (
    <section
      className="settings-connections"
      aria-labelledby="connections-title"
      data-settings-connections
    >
      {connectedProvider && (
        <ConnectionSuccessOverlay
          key={connectedProvider}
          provider={connectedProvider}
          onComplete={finishConfirmation}
        />
      )}
      <h2 id="connections-title" className="settings-connections__heading">
        {t('connections')}
      </h2>

      {!data ? (
        <div
          className="settings-connections__state"
          role={error ? 'alert' : 'status'}
          aria-busy={!error}
        >
          {error ? (
            <>
              <CircleAlert aria-hidden="true" className="size-8" />
              <p>{t('connectionsError')}</p>
              <Button
                type="button"
                className="settings-connections__primary"
                onClick={reload}
                disabled={controlsDisabled}
              >
                {t('retry')}
              </Button>
            </>
          ) : (
            <>
              <LoadingIndicator className="size-7" />
              <p>{t('connectionsLoading')}</p>
            </>
          )}
        </div>
      ) : (
        <>
          {error && (
            <p className="settings-connections__error" role="alert">
              {t('connectionsError')}{' '}
              <Button
                type="button"
                variant="ghost"
                onClick={reload}
                disabled={controlsDisabled}
              >
                {t('retry')}
              </Button>
            </p>
          )}
          <ul className="settings-connections__list">
            {withAllPublishingProviders(data.providers).map((provider) => {
              const accounts = data.accounts.filter(
                (account) => account.provider === provider.id
              )
              const rows = accounts.length ? accounts : [null]
              return (
                <li key={provider.id} data-settings-provider={provider.id}>
                  {rows.map((account) => {
                    const rowId = account?.id ?? provider.id
                    return (
                      <SettingsConnectionRow
                        key={rowId}
                        provider={provider}
                        account={account}
                        disabled={controlsDisabled}
                        busy={
                          busyAccount === rowId ||
                          busyProvider === provider.id ||
                          startingProvider === provider.id
                        }
                        confirming={confirming === rowId}
                        consentOpen={consentRow === rowId}
                        youtubeConsent={youtubeConsent}
                        error={
                          actionError?.accountId === rowId
                            ? actionError.message
                            : null
                        }
                        onConnect={() => beginConnection(provider.id, rowId)}
                        onConfirmConnect={() =>
                          void connectProvider(provider.id)
                        }
                        onConsentChange={setYouTubeConsent}
                        onCancelConsent={() => setConsentRow(null)}
                        onDisconnect={() => {
                          if (disabled || actionLock.current) return
                          setConfirming(rowId)
                          setConsentRow(null)
                          setActionError(null)
                        }}
                        onConfirmDisconnect={() => void disconnect(rowId)}
                        onCancelDisconnect={() => {
                          if (disabled || actionLock.current) return
                          setConfirming(null)
                          setActionError(null)
                        }}
                      />
                    )
                  })}
                </li>
              )
            })}
          </ul>
          <p className="settings-connections__footer">
            {design('managePrefix')}{' '}
            <Link
              href="/dashboard/publish"
              className="settings-connections__publish-link"
            >
              {design('publish')}
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </p>
        </>
      )}
    </section>
  )
}
