'use client'

import type { PublishingProvider } from '@/lib/publishing'
import { Check } from 'lucide-react'
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
} satisfies Record<PublishingProvider, string>

export function ConnectionSuccessOverlay({
  provider,
  onComplete
}: {
  provider: PublishingProvider
  onComplete: () => void
}) {
  const t = useTranslations('contentCalendar.connections')
  const [imageState, setImageState] = useState<'loading' | 'ready' | 'failed'>(
    'loading'
  )

  useEffect(() => {
    if (imageState !== 'loading') return
    const timeout = window.setTimeout(() => setImageState('failed'), 5000)
    return () => window.clearTimeout(timeout)
  }, [imageState])

  useEffect(() => {
    if (imageState === 'loading') return
    const timeout = window.setTimeout(onComplete, 3000)
    return () => window.clearTimeout(timeout)
  }, [imageState, onComplete])

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
            src={CONNECTION_EFFECTS[provider]}
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
