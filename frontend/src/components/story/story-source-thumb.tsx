import { useState } from 'react'
import { FileVideo } from 'lucide-react'
import { formatDuration } from '@/lib/youtube'
import styles from './story-sources.module.css'

interface Props {
  thumbnailURL?: string
  /** Playable source for a frame when no thumbnail exists yet. */
  videoURL?: string
  duration?: number
  /** Reports the duration of a local file once its metadata loads. */
  onMetadata?: (seconds: number) => void
}

/** 16:9 preview of one footage row, with its duration badge. */
export function SourceThumb({ thumbnailURL, videoURL, duration, onMetadata }: Props) {
  const [failedURL, setFailedURL] = useState<string>()
  const playable = videoURL && videoURL !== failedURL ? videoURL : undefined
  return (
    <div className={styles.thumbWrap}>
      {thumbnailURL ? (
        <img src={thumbnailURL} alt="" className={styles.thumb} />
      ) : playable ? (
        <video
          src={playable}
          preload={onMetadata ? 'metadata' : 'none'}
          muted
          playsInline
          aria-hidden="true"
          className={styles.thumb}
          onError={() => setFailedURL(playable)}
          onLoadedMetadata={(event) => {
            const seconds = event.currentTarget.duration
            if (onMetadata && Number.isFinite(seconds)) onMetadata(seconds)
          }}
        />
      ) : (
        <span className={styles.thumbFallback} aria-hidden="true">
          <FileVideo size={22} />
        </span>
      )}
      {duration !== undefined && duration > 0 && (
        <span className={styles.duration}>{formatDuration(duration)}</span>
      )}
    </div>
  )
}
