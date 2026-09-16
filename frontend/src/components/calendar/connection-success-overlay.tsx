'use client'

import type { PublishingProvider } from '@/lib/publishing'
import { Check } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const CONNECTION_EFFECTS = {
  instagram: { src: '/brand/instagram-connected-effect.svg', durationMs: 2377 },
  facebook: { src: '/brand/facebook-connected-effect.svg', durationMs: 2211 },
  tiktok: { src: '/brand/tiktok-connected-effect.svg', durationMs: 1500 },
  youtube: { src: '/brand/youtube-connected-effect.svg', durationMs: 2377 },
  linkedin: { src: '/brand/Share%20on%20Linkedin.svg', durationMs: 3003 },
  twitter: { src: '/brand/X%20Twitter%20logo.svg', durationMs: 4004 }
} satisfies Record<PublishingProvider, { src: string; durationMs: number }>

export function ConnectionSuccessOverlay({
  provider,
  onComplete
}: {
  provider: PublishingProvider
  onComplete: () => void
}) {
  const t = useTranslations('contentCalendar.connections')
  const animationId = useId()
  const effect = CONNECTION_EFFECTS[provider]
  const completed = useRef(false)
  const onCompleteRef = useRef(onComplete)
  const [imageState, setImageState] = useState<'loading' | 'ready' | 'failed'>(
    'loading'
  )

  useEffect(() => {
    onCompleteRef.current = onComplete
  }, [onComplete])

  useEffect(() => {
    if (imageState !== 'loading') return
    const timeout = window.setTimeout(() => setImageState('failed'), 5000)
    return () => window.clearTimeout(timeout)
  }, [imageState])

  useEffect(() => {
    if (imageState === 'loading' || completed.current) return
    const timeout = window.setTimeout(
      () => {
        completed.current = true
        onCompleteRef.current()
      },
      imageState === 'failed' ? 1500 : effect.durationMs
    )
    return () => window.clearTimeout(timeout)
  }, [imageState, effect.durationMs])

  if (typeof document === 'undefined') return null

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-background/55 backdrop-blur-md animate-in fade-in duration-300 motion-reduce:animate-none"
      role="status"
      aria-live="polite"
      aria-label={t('connected')}
    >
      <div className="flex flex-col items-center gap-3 animate-in zoom-in-95 duration-300 motion-reduce:animate-none">
        {imageState === 'failed' ? (
          <Check
            className="size-24 text-success motion-reduce:hidden"
            aria-hidden="true"
          />
        ) : (
          <img
            key={provider}
            // A new confirmation gets its own SVG timeline, even for a cached image.
            src={`${effect.src}?confirmation=${encodeURIComponent(animationId)}`}
            width={240}
            height={240}
            alt=""
            className="size-60 max-h-[70vh] max-w-[70vw] motion-reduce:hidden"
            onLoad={() => setImageState('ready')}
            onError={() => setImageState('failed')}
          />
        )}
        <Check
          className="hidden size-24 text-success motion-reduce:block"
          aria-hidden="true"
        />
        <p className="text-sm font-semibold text-foreground">
          {t('connected')}
        </p>
      </div>
    </div>,
    document.body
  )
}
