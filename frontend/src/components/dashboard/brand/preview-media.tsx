import { Button } from '@/components/ui/button'
import { LoadingIndicator } from '@/components/ui/loading-indicator'
import { Film, Upload } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useRef, type RefObject } from 'react'
import type { BrandPreviewMedia } from './use-brand-preview-media'
import styles from './preview-panel.module.css'

export function PreviewMediaLayer({ media, video, muted, loading, failed, onMediaChange, onMediaError }: {
  media: BrandPreviewMedia | null
  video: RefObject<HTMLVideoElement | null>
  muted: boolean
  loading: boolean
  failed: boolean
  onMediaChange: () => void
  onMediaError: () => void
}) {
  const t = useTranslations('brand.previewDesign')
  useEffect(() => {
    const element = video.current
    return () => element?.pause()
  }, [media?.url, video])

  if (!media) {
    return (
      <div className={styles.emptyMedia}>
        {loading ? <LoadingIndicator className="size-8" /> : <><Film className="size-7" /><p>{t(failed ? 'mediaError' : 'noMedia')}</p></>}
      </div>
    )
  }
  if (media.type === 'image') return <img src={media.url} alt="" className={styles.media} />
  return (
    <video
      ref={video}
      key={media.url}
      src={media.url}
      poster={media.poster}
      className={styles.media}
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
      aria-label={t('mediaLabel')}
    />
  )
}

export function PreviewMediaPicker({ failed, onChoose, onRetry }: {
  failed: boolean
  onChoose: (file: File) => void
  onRetry: () => void
}) {
  const t = useTranslations('brand')
  const input = useRef<HTMLInputElement>(null)
  return (
    <div className={styles.mediaActions}>
      <input
        ref={input}
        className="sr-only"
        type="file"
        accept="video/*,image/*"
        aria-label={t('previewDesign.chooseMedia')}
        onChange={event => {
          const file = event.currentTarget.files?.[0]
          event.currentTarget.value = ''
          if (file) onChoose(file)
        }}
      />
      <Button type="button" variant="ghost" size="sm" onClick={() => input.current?.click()} title={t('previewDesign.localMediaHint')}>
        <Upload className="size-3" />{t('previewDesign.chooseMedia')}
      </Button>
      {failed && <Button type="button" variant="ghost" size="sm" onClick={onRetry}>{t('retry')}</Button>}
    </div>
  )
}
