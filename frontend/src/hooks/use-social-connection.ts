'use client'

import { useToast } from '@/components/ui/toast'
import { apiFetch } from '@/lib/auth'
import type { PublishingProvider } from '@/lib/publishing'
import {
  type SocialConnectionResult,
  completeSocialConnection,
  listenForSocialConnection
} from '@/lib/social-connection'
import { useLocale, useTranslations } from 'next-intl'
import { useCallback, useEffect, useRef, useState } from 'react'

export function useSocialConnection(onComplete: () => void) {
  const locale = useLocale()
  const t = useTranslations('settings')
  const addToast = useToast((state) => state.add)
  const [busyProvider, setBusyProvider] = useState<PublishingProvider | null>(
    null
  )
  const [connectedProvider, setConnectedProvider] =
    useState<PublishingProvider | null>(null)
  const activeRequest = useRef<AbortController | null>(null)
  const callback = useRef<Promise<SocialConnectionResult | null> | null>(null)
  const callbackHandled = useRef(false)

  const receiveResult = useCallback(
    (result: SocialConnectionResult) => {
      setBusyProvider(null)
      if (result.provider) setConnectedProvider(result.provider)
      else addToast('error', t('connectionActionFailed'))
    },
    [addToast, t]
  )

  useEffect(() => {
    let active = true
    // Reuse the consumed callback across Strict Mode's effect replay.
    callback.current ??= completeSocialConnection()
    void callback.current.then((result) => {
      if (active && result && !callbackHandled.current) {
        callbackHandled.current = true
        receiveResult(result)
      }
    })
    return () => {
      active = false
    }
  }, [receiveResult])

  useEffect(() => () => activeRequest.current?.abort(), [])

  async function connect(provider: PublishingProvider) {
    activeRequest.current?.abort()
    const controller = new AbortController()
    activeRequest.current = controller
    const popup = window.open(
      'about:blank',
      '_blank',
      'popup=yes,width=620,height=760,left=120,top=80'
    )
    setBusyProvider(provider)
    if (popup) {
      const stopListening = listenForSocialConnection(
        popup,
        provider,
        receiveResult,
        () => setBusyProvider(null)
      )
      controller.signal.addEventListener('abort', stopListening, { once: true })
    }
    try {
      const response = await apiFetch(`/api/publishing/connect/${provider}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locale }),
        signal: controller.signal
      })
      const result: unknown = await response.json().catch(() => null)
      if (
        !response.ok ||
        typeof result !== 'object' ||
        result === null ||
        !('url' in result) ||
        typeof result.url !== 'string'
      )
        throw new Error('Unable to start connection')
      if (controller.signal.aborted) return
      if (popup && !popup.closed) {
        popup.location.assign(result.url)
        popup.focus()
      } else if (!popup) {
        // Mobile browsers may block popups. The callback also supports a full return.
        window.location.assign(result.url)
      } else {
        controller.abort()
        setBusyProvider(null)
      }
    } catch {
      if (controller.signal.aborted) return
      controller.abort()
      popup?.close()
      setBusyProvider(null)
      addToast('error', t('connectionActionFailed'))
    }
  }

  const finishConfirmation = useCallback(() => {
    setConnectedProvider(null)
    onComplete()
  }, [onComplete])

  return { connect, busyProvider, connectedProvider, finishConfirmation }
}
