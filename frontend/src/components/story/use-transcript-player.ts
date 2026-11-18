import { useEffect, useRef, useState } from 'react'
import { transcriptMediaIdentity } from './transcript-media'

/** Keep the loaded recording through polling; adopt renewed access on retry. */
export function useTranscriptPlayer(source: string) {
  const identity = transcriptMediaIdentity(source)
  const [media, setMedia] = useState({ identity, url: source })
  const [failed, setFailed] = useState(false)
  const [playBlocked, setPlayBlocked] = useState(false)
  const player = useRef<HTMLVideoElement>(null)
  const pendingSeek = useRef<number | null>(null)
  if (media.identity !== identity) {
    setMedia({ identity, url: source })
    setFailed(false)
    setPlayBlocked(false)
  }

  useEffect(() => {
    const video = player.current
    if (!video || pendingSeek.current === null) return
    // preload=none needs an explicit request after a renewed URL is committed.
    video.load()
    void video.play().catch((error: unknown) => {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setPlayBlocked(true)
    })
  }, [media.url])

  function play() {
    const video = player.current
    if (!video) return
    void video.play().catch((error: unknown) => {
      // A later seek or a real source change may intentionally interrupt play.
      if (error instanceof DOMException && error.name === 'AbortError') return
      setPlayBlocked(true)
    })
  }

  function loaded() {
    const video = player.current
    if (!video || pendingSeek.current === null) return
    video.currentTime = Math.max(
      0,
      Math.min(
        pendingSeek.current,
        Number.isFinite(video.duration) ? video.duration : pendingSeek.current
      )
    )
    pendingSeek.current = null
    setPlayBlocked(false)
    play()
  }

  function seekAndPlay(start: number) {
    const video = player.current
    if (!video || !Number.isFinite(start)) return
    setPlayBlocked(false)
    pendingSeek.current = Math.max(0, start)
    if (failed) {
      retry()
    } else if (video.readyState < 1) {
      video.load()
      // Request playback in the click gesture, including on mobile browsers.
      play()
    } else loaded()
  }

  function retry() {
    const video = player.current
    if (!video) return
    pendingSeek.current ??= video.currentTime
    setFailed(false)
    setPlayBlocked(false)
    if (media.url !== source) {
      setMedia({ identity, url: source })
      // Metadata from the renewed URL resumes at pendingSeek.
    } else {
      video.load()
      play()
    }
  }

  return {
    player,
    source: media.url,
    failed,
    playBlocked,
    seekAndPlay,
    loaded,
    retry,
    onError: () => setFailed(true)
  }
}
