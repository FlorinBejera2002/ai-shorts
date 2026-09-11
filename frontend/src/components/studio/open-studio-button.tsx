'use client'

import { Button } from '@/components/ui/button'
import { authClient } from '@/lib/auth'
import { ExternalLink, Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useRef, useState } from 'react'
import { createStudioClient, prepareStudioClip } from './studio-client'
import { configuredStudioOrigin } from './studio-config'

const origin = configuredStudioOrigin(
  process.env.NEXT_PUBLIC_STUDIO_URL,
  process.env.NODE_ENV === 'production'
)

export function OpenStudioButton({
  clipId,
  className
}: {
  clipId: string
  className?: string
}) {
  const t = useTranslations('studioEditor')
  const request = useRef<AbortController | null>(null)
  const [opening, setOpening] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => () => request.current?.abort(), [])

  async function handleOpen() {
    if (!origin || request.current) return
    const controller = new AbortController()
    request.current = controller
    setOpening(true)
    setFailed(false)
    try {
      const client = createStudioClient(origin, authClient)
      const url = await prepareStudioClip(
        client,
        clipId,
        AbortSignal.any([controller.signal, AbortSignal.timeout(150000)])
      )
      if (!controller.signal.aborted) window.location.assign(url)
    } catch {
      if (!controller.signal.aborted) setFailed(true)
    } finally {
      request.current = null
      if (!controller.signal.aborted) setOpening(false)
    }
  }

  return (
    <>
      <Button
        type="button"
        className={className}
        disabled={!origin || opening}
        aria-busy={opening}
        onClick={handleOpen}
      >
        {opening ? (
          <Loader2 aria-hidden="true" className="animate-spin" />
        ) : (
          <ExternalLink aria-hidden="true" />
        )}
        {opening ? t('opening') : t('edit')}
      </Button>
      {(failed || !origin) && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {t(origin ? 'openError' : 'unavailable')}
        </p>
      )}
    </>
  )
}
