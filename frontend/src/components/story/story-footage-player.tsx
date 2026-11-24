'use client'

import { Pause, Play } from 'lucide-react'
import { useRef, useState } from 'react'
import { formatDuration } from '@/lib/youtube'
import { useStoryLanguage } from './use-story-language'
import styles from './story-options.module.css'

interface Props {
  src: string
  poster?: string
  label: string
  /** Duration from the project, used until the video reports its own. */
  duration: number
}

/** A 16:9 footage preview with a centred play control and a time row, in the canvas style. */
export function StoryFootagePlayer({ src, poster, label, duration }: Props) {
  const text = useStoryLanguage()
  const video = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(false)
  const [current, setCurrent] = useState(0)
  // The duration the video reports once its metadata loads; the project value is used until then.
  const [reportedDuration, setReportedDuration] = useState<number>()
  const total = reportedDuration ?? duration
  const progress = total > 0 ? Math.min(100, (current / total) * 100) : 0

  function toggle() {
    const element = video.current
    if (!element) return
    if (element.paused) void element.play().catch(() => setPlaying(false))
    else element.pause()
  }

  return (
    <div className={styles.playerWrap}>
      <div className={styles.player}>
        <video
          ref={video}
          className={styles.playerVideo}
          src={src}
          poster={poster}
          preload="metadata"
          playsInline
          aria-label={label}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          onLoadedMetadata={(event) => {
            if (Number.isFinite(event.currentTarget.duration)) setReportedDuration(event.currentTarget.duration)
          }}
          onTimeUpdate={(event) => setCurrent(event.currentTarget.currentTime)}
        />
        <button
          type="button"
          className={styles.playButton}
          data-playing={playing || undefined}
          aria-label={playing ? text('Pause', 'Pauză') : text('Play', 'Redă')}
          onClick={toggle}
        >
          {playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
        </button>
        <div className={styles.playerTime}>
          <span>{formatDuration(current)}</span>
          <span className={styles.playerTrack} aria-hidden="true">
            <span className={styles.playerFill} style={{ width: `${progress}%` }} />
          </span>
          <span>{formatDuration(total)}</span>
        </div>
      </div>
    </div>
  )
}
