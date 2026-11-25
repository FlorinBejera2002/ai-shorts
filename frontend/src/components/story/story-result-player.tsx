'use client'

import { useRef, useState } from 'react'
import { Play } from 'lucide-react'
import { useStoryLanguage } from './use-story-language'

interface Props {
  src: string
  poster?: string
  onDuration: (seconds: number) => void
}

/**
 * Finished clip preview (280 x 498 on desktop). The poster frame shows first with a centred
 * 64px play button; the native controls appear only once playback has started.
 */
export function StoryResultPlayer({ src, poster, onDuration }: Props) {
  const text = useStoryLanguage()
  const video = useRef<HTMLVideoElement>(null)
  const [started, setStarted] = useState(false)
  const [playing, setPlaying] = useState(false)

  const play = () => {
    setStarted(true)
    video.current?.play().catch(() => setPlaying(false))
  }

  return (
    <div className="story-result-player">
      <video
        ref={video}
        src={src}
        poster={poster}
        controls={started}
        playsInline
        preload="metadata"
        onLoadedMetadata={(event) => {
          const seconds = event.currentTarget.duration
          if (Number.isFinite(seconds)) onDuration(seconds)
        }}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        className="story-result-video"
        aria-label={text('Clip preview', 'Previzualizare clip')}
      />
      {!playing && (
        <button
          type="button"
          className="story-result-play"
          aria-label={text('Play', 'Redă')}
          onClick={play}
        >
          <Play aria-hidden="true" fill="currentColor" />
        </button>
      )}
    </div>
  )
}
