import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { MusicTrack } from './types'
import { useStoryLanguage } from './use-story-language'

export function StoryMusicPreview({
  track,
  active,
  startSeconds = 0,
  endSeconds = 0,
  onClose
}: {
  track: Pick<MusicTrack, 'id' | 'title' | 'preview_url'>
  active: boolean
  startSeconds?: number
  endSeconds?: number
  onClose: () => void
}) {
  const text = useStoryLanguage()
  const player = useRef<HTMLAudioElement>(null)
  const [failed, setFailed] = useState(false)
  const validRange =
    Number.isFinite(startSeconds) &&
    startSeconds >= 0 &&
    Number.isFinite(endSeconds) &&
    (endSeconds === 0 || endSeconds > startSeconds)

  useEffect(() => {
    const audio = player.current
    if (audio) audio.src = track.preview_url
    return () => {
      // Release the stream on step changes, replacement and unmount.
      if (audio) {
        audio.pause()
        audio.removeAttribute('src')
        audio.load()
      }
    }
  }, [track.preview_url])

  useEffect(() => {
    if (!active || !validRange) player.current?.pause()
  }, [active, validRange])

  useEffect(() => {
    const audio = player.current
    if (audio && audio.readyState >= 1 && validRange)
      audio.currentTime = Math.min(startSeconds, audio.duration || startSeconds)
  }, [startSeconds, endSeconds, validRange])

  return (
    <div
      className="space-y-2 rounded-md bg-muted p-3"
      data-testid="music-preview"
    >
      <div className="flex min-w-0 items-center justify-between gap-2">
        <span className="truncate text-sm font-medium">{track.title}</span>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label={text(
            'Stop music preview',
            'Oprește previzualizarea muzicii'
          )}
          onClick={onClose}
        >
          <X className="size-4" aria-hidden="true" />
        </Button>
      </div>
      <audio
        ref={player}
        src={track.preview_url}
        controls
        autoPlay
        preload="none"
        className="h-10 w-full min-w-0"
        aria-label={`${text('Music preview', 'Previzualizare muzică')}: ${track.title}`}
        onError={() => setFailed(true)}
        onLoadedMetadata={(event) => {
          if (!validRange) return
          event.currentTarget.currentTime = Math.min(
            startSeconds,
            event.currentTarget.duration || startSeconds
          )
        }}
        onTimeUpdate={(event) => {
          const audio = event.currentTarget
          const end = endSeconds || startSeconds + 600
          if (audio.currentTime >= end && !audio.paused) {
            audio.pause()
            audio.currentTime = Math.min(end, audio.duration)
          }
        }}
        onPlay={(event) => {
          const audio = event.currentTarget
          if (!active || !validRange) {
            audio.pause()
            return
          }
          if (
            audio.currentTime < startSeconds ||
            audio.currentTime >= (endSeconds || startSeconds + 600)
          )
            audio.currentTime = Math.min(
              startSeconds,
              audio.duration || startSeconds
            )
        }}
      />
      {failed && (
        <p role="status" className="text-sm text-muted-foreground">
          {text(
            'This preview could not load. Try another track or try again later.',
            'Previzualizarea nu s-a încărcat. Încearcă altă piesă sau revino mai târziu.'
          )}
        </p>
      )}
    </div>
  )
}
