'use client'

import type { PublishingProvider } from '@/lib/publishing'
import { Check } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { PlatformBrandIcon } from '@/components/publishing/platform-brand-icon'
import theme from './publishing-theme.module.css'
import styles from './calendar-publishing.module.css'

const CONNECTION_EFFECTS = {
  instagram: { src: '/brand/instagram-connected-effect.svg', durationMs: 2377 },
  facebook: { src: '/brand/facebook-connected-effect.svg', durationMs: 2211 },
  tiktok: { src: '/brand/tiktok-connected-effect.svg', durationMs: 1500 },
  youtube: { src: '/brand/youtube-connected-effect.svg', durationMs: 2377 }
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
      className={`${theme.overlay} fixed inset-0 z-[200] flex items-center justify-center animate-in fade-in duration-300 motion-reduce:animate-none`}
      role="status"
      aria-live="polite"
      aria-label={t('connected')}
    >
      <div
        data-publish-surface=""
        className={`${theme.surface} ${styles.successCard} animate-in zoom-in-95 duration-300 motion-reduce:animate-none`}
      >
        <div className={styles.successProvider}>
          <PlatformBrandIcon
            provider={provider}
            className="size-20 rounded-full"
          />
          <span className={styles.successCheck}>
            <Check aria-hidden="true" />
          </span>
        </div>
        {imageState !== 'failed' && (
          <img
            key={provider}
            // A new confirmation gets its own SVG timeline, even for a cached image.
            src={`${effect.src}?confirmation=${encodeURIComponent(animationId)}`}
            width={240}
            height={240}
            alt=""
            className="sr-only"
            onLoad={() => setImageState('ready')}
            onError={() => setImageState('failed')}
          />
        )}
        <p className={styles.successTitle}>{t('connected')}</p>
      </div>
    </div>,
    document.body
  )
}
