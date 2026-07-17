'use client'

import { useEffect, useState } from 'react'

const FRAME_COUNT = 16
const FRAME_WIDTH = 96
const FRAME_HEIGHT = 54
const TOTAL_TIMEOUT_MS = 12000

/**
 * Best-effort filmstrip: extracts evenly spaced frames from the source video.
 * Returns data URLs, or an empty array while loading / when extraction is
 * impossible (CORS-tainted canvas, decode errors, slow network).
 */
export function useFilmstrip(sourceUrl: string, duration: number): string[] {
  const [frames, setFrames] = useState<string[]>([])

  useEffect(() => {
    if (!sourceUrl || duration <= 0) return
    let cancelled = false

    const video = document.createElement('video')
    video.crossOrigin = 'anonymous'
    video.muted = true
    video.preload = 'auto'

    const canvas = document.createElement('canvas')
    canvas.width = FRAME_WIDTH
    canvas.height = FRAME_HEIGHT
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const timeout = setTimeout(() => {
      cancelled = true
      video.removeAttribute('src')
      video.load()
    }, TOTAL_TIMEOUT_MS)

    const seekTo = (time: number) =>
      new Promise<void>((resolve, reject) => {
        const onSeeked = () => {
          video.removeEventListener('seeked', onSeeked)
          video.removeEventListener('error', onError)
          resolve()
        }
        const onError = () => {
          video.removeEventListener('seeked', onSeeked)
          video.removeEventListener('error', onError)
          reject(new Error('seek failed'))
        }
        video.addEventListener('seeked', onSeeked)
        video.addEventListener('error', onError)
        video.currentTime = time
      })

    const extract = async () => {
      const collected: string[] = []
      for (let i = 0; i < FRAME_COUNT; i++) {
        if (cancelled) return
        const time = ((i + 0.5) / FRAME_COUNT) * duration
        await seekTo(Math.min(time, Math.max(0, duration - 0.1)))
        if (cancelled) return
        ctx.drawImage(video, 0, 0, FRAME_WIDTH, FRAME_HEIGHT)
        // Throws on tainted canvas (no CORS headers) — aborts the filmstrip
        collected.push(canvas.toDataURL('image/jpeg', 0.5))
      }
      if (!cancelled) setFrames(collected)
    }

    const onMetadata = () => {
      extract().catch(() => undefined)
    }
    const onError = () => undefined

    video.addEventListener('loadedmetadata', onMetadata)
    video.addEventListener('error', onError)
    video.src = sourceUrl

    return () => {
      cancelled = true
      clearTimeout(timeout)
      video.removeEventListener('loadedmetadata', onMetadata)
      video.removeEventListener('error', onError)
      video.removeAttribute('src')
      video.load()
    }
  }, [sourceUrl, duration])

  return frames
}
