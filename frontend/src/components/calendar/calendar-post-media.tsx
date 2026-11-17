'use client'

import { Button } from '@/components/ui/button'
import { LoadingIndicator } from '@/components/ui/loading-indicator'
import { apiFetch } from '@/lib/auth'
import type { PublishingMedia, ScheduledPostRecord } from '@/lib/content-calendar'
import type { PublishingData } from '@/lib/publishing'
import { formatDuration } from '@/lib/utils'
import { ChevronLeft, ChevronRight, Film, ImageOff, RefreshCw } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { PublishingImagePreview } from './publishing-image-preview'
import styles from './calendar-post-preview.module.css'

type PreviewResult = {
  reference: string
  attempt: number
  url?: string
  failed: boolean
}

function useMediaPreview(reference: string, enabled = true) {
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState<PreviewResult | null>(null)

  useEffect(() => {
    if (!reference || !enabled) return
    const controller = new AbortController()

    async function loadPreview() {
      try {
        const response = await apiFetch(
          `/api/publishing/media/preview?reference=${encodeURIComponent(reference)}`,
          { signal: controller.signal }
        )
        if (!response.ok) throw new Error('Preview request failed')
        const data = await response.json() as { url?: string }
        if (!data.url) throw new Error('Preview URL is missing')
        if (!controller.signal.aborted) {
          setResult({ reference, attempt, url: data.url, failed: false })
        }
      } catch {
        if (!controller.signal.aborted) {
          setResult({ reference, attempt, failed: true })
        }
      }
    }

    void loadPreview()
    return () => controller.abort()
  }, [reference, attempt, enabled])

  const current = result?.reference === reference && result.attempt === attempt
    ? result
    : null

  return {
    url: current?.url,
    failed: current?.failed ?? false,
    loading: enabled && !current,
    retry: () => setAttempt(value => value + 1)
  }
}

function MediaUnavailable({ onRetry }: { onRetry?: () => void }) {
  const t = useTranslations('contentCalendar.publishing')
  return (
    <div className={styles.unavailable} role="status">
      <ImageOff className="size-7" aria-hidden="true" />
      <p>{t('previewUnavailable')}</p>
      {onRetry && (
        <Button type="button" size="sm" variant="outline" onClick={onRetry}>
          <RefreshCw className="size-4" aria-hidden="true" />
          {t('retryPreview')}
        </Button>
      )}
    </div>
  )
}

function UploadedMediaPreview({ item, socialPreview = false }: { item: PublishingMedia; socialPreview?: boolean }) {
  const { url, failed, loading, retry } = useMediaPreview(item.reference)
  const [mediaFailed, setMediaFailed] = useState(false)

  if (failed || mediaFailed) {
    return <MediaUnavailable onRetry={() => { setMediaFailed(false); retry() }} />
  }
  if (loading || !url) {
    return <div className={styles.mediaLoading} aria-busy="true"><LoadingIndicator className="size-8" /></div>
  }
  if (item.type === 'image') {
    return (
      <div className={styles.imageFrame} onErrorCapture={() => setMediaFailed(true)}>
        <PublishingImagePreview item={item} src={url} fullSize={socialPreview} />
      </div>
    )
  }
  return (
    <video
      key={url}
      className={styles.video}
      src={url}
      controls={true}
      playsInline={true}
      preload="metadata"
      onError={() => setMediaFailed(true)}
    />
  )
}

type ClipPreviewResult = {
  clipId: string
  attempt: number
  source?: string
  thumbnailUrl?: string | null
  failed: boolean
}

type ClipPreviewResponse = {
  preview_url?: string | null
  file_url?: string | null
  thumbnail_url?: string | null
}

function ClipPreview({
  clipId,
  fallbackSource,
  poster
}: {
  clipId: string
  fallbackSource?: string
  poster?: string | null
}) {
  const [result, setResult] = useState<ClipPreviewResult | null>(null)
  const [mediaFailed, setMediaFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()

    async function loadClipPreview() {
      try {
        const response = await apiFetch(`/api/clips/${encodeURIComponent(clipId)}`, {
          signal: controller.signal
        })
        if (!response.ok) throw new Error('Clip preview request failed')
        const data = await response.json() as ClipPreviewResponse
        const source = data.preview_url || data.file_url || fallbackSource
        if (!source) throw new Error('Clip preview URL is missing')
        if (!controller.signal.aborted) {
          setResult({
            clipId,
            attempt,
            source,
            thumbnailUrl: data.thumbnail_url,
            failed: false
          })
        }
      } catch {
        if (!controller.signal.aborted) {
          setResult({ clipId, attempt, failed: true })
        }
      }
    }

    void loadClipPreview()
    return () => controller.abort()
  }, [clipId, fallbackSource, attempt])

  const current = result?.clipId === clipId && result.attempt === attempt
    ? result
    : null

  function retryPreview() {
    setMediaFailed(false)
    setAttempt(value => value + 1)
  }

  if (current?.failed || mediaFailed) {
    return <MediaUnavailable onRetry={retryPreview} />
  }
  if (!current) {
    return <div className={styles.mediaLoading} aria-busy="true"><LoadingIndicator className="size-8" /></div>
  }
  return (
    <video
      key={`${clipId}-${attempt}`}
      className={styles.video}
      src={current.source}
      poster={current.thumbnailUrl || poster || undefined}
      controls={true}
      playsInline={true}
      preload="metadata"
      onError={() => setMediaFailed(true)}
    />
  )
}

export function CalendarPostMedia({
  post,
  publishingClips,
  overlay
}: {
  post: ScheduledPostRecord
  publishingClips: PublishingData['clips']
  overlay?: ReactNode
}) {
  const t = useTranslations('contentCalendar.publishing')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const media = post.media ?? []
  const currentIndex = Math.min(selectedIndex, Math.max(0, media.length - 1))
  const currentMedia = media[currentIndex]
  const clip = publishingClips.find(item => item.id === post.clip?.id)

  if (post.clip) {
    const player = (
      <ClipPreview
        key={post.clip.id}
        clipId={post.clip.id}
        fallbackSource={clip?.fileUrl}
        poster={post.clip.thumbnailUrl}
      />
    )
    return overlay ? <div data-publishing-media-stage="" data-media-type="video">{player}{overlay}</div> : player
  }
  if (!currentMedia) {
    return (
      <div className={styles.unavailable}>
        <Film className="size-8" aria-hidden="true" />
        <p>{t('noMedia')}</p>
      </div>
    )
  }

  return (
    <div className={styles.carousel}>
      <div data-publishing-media-stage={overlay ? '' : undefined} data-media-type={currentMedia.type}>
        <UploadedMediaPreview key={currentMedia.reference} item={currentMedia} socialPreview={Boolean(overlay)} />
        {overlay}
      </div>
      {media.length > 1 && (
        <div className={styles.carouselNavigation}>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label={t('previousMedia')}
            disabled={currentIndex === 0}
            onClick={() => setSelectedIndex(currentIndex - 1)}
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
          </Button>
          <span aria-live="polite">{t('mediaPosition', { current: currentIndex + 1, count: media.length })}</span>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label={t('nextMedia')}
            disabled={currentIndex === media.length - 1}
            onClick={() => setSelectedIndex(currentIndex + 1)}
          >
            <ChevronRight className="size-4" aria-hidden="true" />
          </Button>
        </div>
      )}
    </div>
  )
}

function UploadedThumbnail({ item }: { item: PublishingMedia }) {
  const containerRef = useRef<HTMLSpanElement>(null)
  const [visible, setVisible] = useState(false)
  const [mediaFailed, setMediaFailed] = useState(false)
  const { url, failed } = useMediaPreview(item.reference, visible)

  useEffect(() => {
    const element = containerRef.current
    if (!element) return
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        setVisible(true)
        observer.disconnect()
      }
    }, { rootMargin: '200px' })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return (
    <span ref={containerRef} className={styles.thumbnailContent} onErrorCapture={() => setMediaFailed(true)}>
      {url && !failed && !mediaFailed
        ? item.type === 'image'
          ? <PublishingImagePreview item={item} src={url} thumbnail={true} />
          : <video src={url} className={styles.thumbnailVideo} muted={true} playsInline={true} preload="metadata" />
        : <Film className="size-6" aria-hidden="true" />}
    </span>
  )
}

function ClipThumbnail({ src }: { src: string }) {
  const [failed, setFailed] = useState(false)
  return failed
    ? <Film className="size-6" aria-hidden="true" />
    : <img src={src} alt="" loading="lazy" className={styles.thumbnailImage} onError={() => setFailed(true)} />
}

export function CalendarPostThumbnail({ post }: { post: ScheduledPostRecord }) {
  const firstMedia = post.media?.[0]
  return (
    <span className={styles.thumbnail} aria-hidden="true">
      {post.clip?.thumbnailUrl
        ? <ClipThumbnail key={post.clip.thumbnailUrl} src={post.clip.thumbnailUrl} />
        : firstMedia
          ? <UploadedThumbnail key={firstMedia.reference} item={firstMedia} />
          : <Film className="size-6" />}
      {post.clip && Number.isFinite(post.clip.duration) && post.clip.duration > 0 && (
        <span className={styles.duration}>{formatDuration(post.clip.duration)}</span>
      )}
    </span>
  )
}
