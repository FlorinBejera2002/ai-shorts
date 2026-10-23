import { useEffect, useRef, useState } from 'react'
import type { PreviewPlaybackState } from './preview-playback'

const initialPlayback: PreviewPlaybackState = {
  time: 0,
  duration: 0,
  playing: false,
  muted: true,
  failed: false,
  ready: false
}

export function useBrandPreviewPlayer(source?: string) {
  const video = useRef<HTMLVideoElement>(null)
  const [stored, setStored] = useState({ ...initialPlayback, source: '' })
  const state = stored.source === source ? stored : initialPlayback

  useEffect(() => {
    if (!state.playing) return
    const timer = setInterval(() => {
      const node = video.current
      if (node) setStored(current => ({ ...current, time: node.currentTime }))
    }, 50)
    return () => clearInterval(timer)
  }, [state.playing])

  function readMedia() {
    const node = video.current
    if (!node || !source) return
    setStored({
      source,
      time: node.currentTime || 0,
      duration: Number.isFinite(node.duration) ? node.duration : 0,
      playing: !node.paused && !node.ended,
      muted: node.muted,
      failed: false,
      ready: node.readyState >= 2
    })
  }

  function failMedia() {
    setStored(current => ({ ...current, source: source ?? '', failed: true, ready: false, playing: false }))
  }

  async function togglePlayback() {
    const node = video.current
    if (!node) return
    if (node.paused) {
      try { await node.play() } catch { failMedia() }
    } else node.pause()
  }

  function seek(time: number) {
    if (video.current) video.current.currentTime = time
  }

  function toggleMute() {
    if (video.current) video.current.muted = !video.current.muted
  }

  return { video, state, readMedia, failMedia, togglePlayback, seek, toggleMute, reload: () => video.current?.load() }
}
