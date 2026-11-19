'use client'

import { useToast } from '@/components/ui/toast'
import { useApiResource } from '@/hooks/use-api-resource'
import { useSocialConnection } from '@/hooks/use-social-connection'
import { extractApiError } from '@/lib/api-error'
import { apiFetch } from '@/lib/auth'
import {
  type PublishingAccount,
  type PublishingData,
  type PublishingProvider,
  withAllPublishingProviders
} from '@/lib/publishing'
import { useTranslations } from 'next-intl'
import { useRef, useState } from 'react'
import { runExclusive } from './run-exclusive'
import { checked, isPublishingData } from './settings-data'

type ProviderInfo = PublishingData['providers'][number]
export type ConnectionCardData = { provider: ProviderInfo; account: PublishingAccount | null }

/** One card per connected account, plus an empty card for each provider without one. */
export function connectionCards(data: PublishingData): ConnectionCardData[] {
  return withAllPublishingProviders(data.providers).flatMap((provider): ConnectionCardData[] => {
    const accounts = data.accounts.filter((account) => account.provider === provider.id)
    return accounts.length ? accounts.map((account) => ({ provider, account })) : [{ provider, account: null }]
  })
}

/** Social accounts from `/api/publishing`: connect (with YouTube consent), reconnect and disconnect. */
export function useSettingsConnections(lock: { acquire: () => boolean; release: () => void }) {
  const t = useTranslations('settings')
  const toast = useToast()
  const raw = useApiResource<PublishingData>('/api/publishing')
  const resource = { ...checked(raw, isPublishingData), reload: raw.reload }
  const social = useSocialConnection(raw.reload)
  const [busyAccount, setBusyAccount] = useState<string | null>(null)
  const [starting, setStarting] = useState<PublishingProvider | null>(null)
  const [disconnectTarget, setDisconnectTarget] = useState<PublishingAccount | null>(null)
  const [consentOpen, setConsentOpen] = useState(false)
  const [youtubeConsent, setYouTubeConsent] = useState(false)
  const [actionError, setActionError] = useState<{ id: string; message: string } | null>(null)
  const actionLock = useRef(false)
  const busy = busyAccount !== null || starting !== null || social.busyProvider !== null

  function claim() {
    return !actionLock.current && !social.busyProvider && lock.acquire()
  }

  function unlock() {
    actionLock.current = false
    lock.release()
  }

  async function startConnection(provider: PublishingProvider, consent: boolean) {
    await runExclusive({
      claim,
      onStart: () => {
        actionLock.current = true
        setStarting(provider)
        setConsentOpen(false)
        setActionError(null)
      },
      onError: () => setActionError({ id: provider, message: t('connectionActionFailed') }),
      onFinish: () => {
        setStarting(null)
        unlock()
      },
      action: () => social.connect(provider, consent)
    })
  }

  /** YouTube asks for consent to its terms first; the other providers open OAuth directly. */
  function connect(provider: PublishingProvider) {
    if (busy) return
    if (provider === 'youtube') {
      setYouTubeConsent(false)
      setConsentOpen(true)
      return
    }
    void startConnection(provider, false)
  }

  function confirmYouTube() {
    if (youtubeConsent) void startConnection('youtube', true)
  }

  function closeConsent() {
    if (!starting) setConsentOpen(false)
  }

  function askDisconnect(account: PublishingAccount) {
    if (busy) return
    setActionError(null)
    setDisconnectTarget(account)
  }

  function closeDisconnect() {
    if (!busyAccount) setDisconnectTarget(null)
  }

  async function disconnect() {
    const account = disconnectTarget
    if (!account) return
    await runExclusive({
      claim,
      onStart: () => {
        actionLock.current = true
        setBusyAccount(account.id)
        setActionError(null)
      },
      onError: (caught) =>
        setActionError({ id: account.id, message: caught instanceof Error ? caught.message : t('connectionActionFailed') }),
      onFinish: () => {
        setBusyAccount(null)
        unlock()
      },
      action: () => removeAccount(account.id)
    })
  }

  async function removeAccount(id: string) {
    const response = await apiFetch(`/api/publishing/accounts/${encodeURIComponent(id)}`, { method: 'DELETE' })
    const result: unknown = await response.json().catch(() => null)
    if (!response.ok) {
      const body = result && typeof result === 'object' && !Array.isArray(result) ? (result as Record<string, unknown>) : {}
      throw new Error(extractApiError(body, t('connectionActionFailed')))
    }
    setDisconnectTarget(null)
    resource.reload()
    toast.add('success', t('connectionDisconnected'))
  }

  return {
    ...resource,
    busy,
    busyId: busyAccount ?? starting ?? social.busyProvider,
    actionError,
    connect,
    consentOpen,
    youtubeConsent,
    setYouTubeConsent,
    confirmYouTube,
    closeConsent,
    disconnectTarget,
    askDisconnect,
    closeDisconnect,
    disconnect,
    connectedProvider: social.connectedProvider,
    finishConfirmation: social.finishConfirmation
  }
}

export type SettingsConnectionsController = ReturnType<typeof useSettingsConnections>
