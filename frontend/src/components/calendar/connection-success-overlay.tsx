'use client'

import { useTranslations } from 'next-intl'
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
  return value !== null && value in CONNECTION_EFFECTS
}

type ConnectionMessage = {
  type: 'sneepcut:social-connected'
  provider: AnimatedProvider
}

function isConnectionMessage(value: unknown): value is ConnectionMessage {
  if (typeof value !== 'object' || value === null) return false
  const message = value as Partial<ConnectionMessage>
  return (
    message.type === 'sneepcut:social-connected' &&
    isAnimatedProvider(message.provider ?? null)
  )
}

export function ConnectionSuccessOverlay({
  onComplete
}: {
  onComplete: () => void
}) {
  const t = useTranslations('contentCalendar.connections')
  const [provider, setProvider] = useState<AnimatedProvider | null>(null)
  const [animationReady, setAnimationReady] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.has('connectionError')) {
      window.sessionStorage.removeItem(PENDING_CONNECTION_KEY)
      if (window.opener && window.opener !== window) window.close()
      return
    }

    const connectedProvider =
      params.get('connected') ??
      window.sessionStorage.getItem(PENDING_CONNECTION_KEY)
    if (!isAnimatedProvider(connectedProvider)) return

    if (window.opener && window.opener !== window) {
      window.opener.postMessage(
        {
          type: 'sneepcut:social-connected',
          provider: connectedProvider
        } satisfies ConnectionMessage,
        window.location.origin
      )
      window.sessionStorage.removeItem(PENDING_CONNECTION_KEY)
      window.close()
      return
    }

    setProvider(connectedProvider)
  }, [])

  useEffect(() => {
    function receiveConnection(event: MessageEvent<unknown>) {
      if (
        event.origin !== window.location.origin ||
        !isConnectionMessage(event.data)
      ) {
        return
      }
      setAnimationReady(false)
      setProvider(event.data.provider)
    }

    window.addEventListener('message', receiveConnection)
    return () => window.removeEventListener('message', receiveConnection)
  }, [])

  useEffect(() => {
    if (!provider || animationReady) return
    const fallback = window.setTimeout(() => setAnimationReady(true), 1500)
    return () => window.clearTimeout(fallback)
  }, [animationReady, provider])

  useEffect(() => {
    if (!provider || !animationReady) return
    const timeout = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search)
      params.delete('connected')
      const query = params.toString()
      window.history.replaceState(
        window.history.state,
        '',
        `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`
      )
      window.sessionStorage.removeItem(PENDING_CONNECTION_KEY)
      setProvider(null)
      setAnimationReady(false)
      onComplete()
    }, 3000)
    return () => window.clearTimeout(timeout)
  }, [animationReady, onComplete, provider])

  if (!provider || typeof document === 'undefined') return null

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-background/55 backdrop-blur-md animate-in fade-in duration-300 motion-reduce:animate-none"
      role="status"
      aria-live="polite"
      aria-label={t('connected')}
    >
      <div className="flex flex-col items-center gap-3 animate-in zoom-in-95 duration-300 motion-reduce:animate-none">
        <object
          key={provider}
          data={CONNECTION_EFFECTS[provider]}
          type="image/svg+xml"
          width={240}
          height={240}
          aria-label={t('connected')}
          className="size-60 max-h-[70vh] max-w-[70vw]"
          onLoad={() => setAnimationReady(true)}
        >
          {t('connected')}
        </object>
        <p className="text-sm font-semibold text-foreground">
          {t('connected')}
        </p>
      </div>
    </div>,
    document.body
  )
}
