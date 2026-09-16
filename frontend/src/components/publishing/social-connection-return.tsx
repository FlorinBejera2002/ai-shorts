'use client'

import { useAuth } from '@/components/auth/use-auth'
import { ConnectionSuccessOverlay } from '@/components/calendar/connection-success-overlay'
import { useToast } from '@/components/ui/toast'
import type { PublishingProvider } from '@/lib/publishing'
import {
  completeSocialConnection,
  readSocialConnectionResult
} from '@/lib/social-connection'
import { useTranslations } from 'next-intl'
import { useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { SocialConnectionReturnContext } from './social-connection-return-context'

export function SocialConnectionReturn({
  children
}: { children: React.ReactNode }) {
  const search = useSearchParams()
  const session = useAuth()
  const t = useTranslations('settings')
  const addToast = useToast((state) => state.add)
  // Keep the return state after consuming the query, including the first SSR frame.
  const [initialResult] = useState(() =>
    readSocialConnectionResult(search.toString())
  )
  const [provider, setProvider] = useState<PublishingProvider | null>(null)
  const [animationComplete, setAnimationComplete] = useState(false)
  const [pageReady, setPageReady] = useState(false)
  const callback = useRef<ReturnType<typeof completeSocialConnection> | null>(
    null
  )
  const handled = useRef(false)
  const finishAnimation = useCallback(() => setAnimationComplete(true), [])
  const onPageReady = useCallback(() => setPageReady(true), [])
  const returning =
    !!initialResult?.provider && (!animationComplete || provider !== null)

  useEffect(() => {
    // Keep the last frame until the destination mounts, including slow auth/RSC.
    const authFailed = !['loading', 'authenticated'].includes(session.status)
    if (animationComplete && (pageReady || authFailed)) setProvider(null)
  }, [animationComplete, pageReady, session.status])
  const context = useMemo(
    () => ({ returning, onPageReady }),
    [returning, onPageReady]
  )

  useEffect(() => {
    let active = true
    // Relay before auth/page loading, and consume once across Strict Mode replay.
    callback.current ??= completeSocialConnection()
    void callback.current.then((result) => {
      if (!active || !result || handled.current) return
      handled.current = true
      if (result.provider) setProvider(result.provider)
      else addToast('error', t('connectionActionFailed'))
    })
    return () => {
      active = false
    }
  }, [addToast, t])

  return (
    <SocialConnectionReturnContext.Provider value={context}>
      {children}
      {returning && provider && (
        <ConnectionSuccessOverlay
          provider={provider}
          onComplete={finishAnimation}
        />
      )}
    </SocialConnectionReturnContext.Provider>
  )
}
