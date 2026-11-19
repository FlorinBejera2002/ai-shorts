import { useEffect, type RefObject } from 'react'
import type { BrandPreviewMedia } from './use-brand-preview-media'
import styles from './preview-card.module.css'

/** The preview's background: the latest library clip, a chosen local file, or a loading placeholder. */
export function PreviewMediaLayer({
  media,
  video,
  muted,
  loading,
  label,
  onMediaChange,
  onMediaError
}: {
  media: BrandPreviewMedia | null
  video: RefObject<HTMLVideoElement | null>
  muted: boolean
  loading: boolean
  label: string
  onMediaChange: () => void
  onMediaError: () => void
}) {
  useEffect(() => {
    const element = video.current
    return () => element?.pause()
  }, [media?.url, video])

  if (!media) return loading ? <span className={styles.mediaLoading} aria-hidden="true" /> : null
  if (media.type === 'image') return <img src={media.url} alt={label} className="absolute inset-0 h-full w-full object-cover" />
  return (
    <video
      ref={video}
      key={media.url}
      src={media.url}
      poster={media.poster}
      className="absolute inset-0 h-full w-full object-cover"
      playsInline={true}
      muted={muted}
      preload="metadata"
      onCanPlay={onMediaChange}
      onLoadedMetadata={onMediaChange}
      onDurationChange={onMediaChange}
      onTimeUpdate={onMediaChange}
      onPlay={onMediaChange}
      onPause={onMediaChange}
      onEnded={onMediaChange}
      onVolumeChange={onMediaChange}
      onError={onMediaError}
      data-brand-preview-video=""
      aria-label={label}
    />
  )
}
