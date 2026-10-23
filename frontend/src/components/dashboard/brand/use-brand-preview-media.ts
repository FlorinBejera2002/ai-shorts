import { apiFetch } from '@/lib/auth'
import { useEffect, useState } from 'react'

export type BrandPreviewMedia = { url: string; poster?: string; type: 'video' | 'image'; title?: string }
type PreviewClip = { previewUrl?: string | null; fileUrl?: string | null; thumbnailUrl?: string | null; title?: string }

export function useBrandPreviewMedia() {
  const [remote, setRemote] = useState<BrandPreviewMedia | null>(null)
  const [local, setLocal] = useState<BrandPreviewMedia | null>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      try {
        const response = await apiFetch('/api/clips/library?page=1', { signal: controller.signal })
        if (!response.ok) throw new Error('Could not load preview media')
        const data = await response.json() as { clips?: PreviewClip[] }
        const clip = data.clips?.find(item => item.previewUrl || item.fileUrl)
        if (controller.signal.aborted) return
        setRemote(clip ? { url: (clip.previewUrl || clip.fileUrl)!, poster: clip.thumbnailUrl || undefined, title: clip.title, type: 'video' } : null)
        setFailed(false)
      } catch {
        if (!controller.signal.aborted) setFailed(true)
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    void load()
    return () => controller.abort()
  }, [attempt])

  useEffect(() => () => {
    if (local) URL.revokeObjectURL(local.url)
  }, [local])

  function chooseFile(file: File) {
    const image = file.type.startsWith('image/') || /\.(jpe?g|png|webp|gif|avif)$/i.test(file.name)
    const video = file.type.startsWith('video/') || /\.(mp4|mov|webm|mkv|avi)$/i.test(file.name)
    if (!image && !video) return
    setLocal({ url: URL.createObjectURL(file), title: file.name, type: image ? 'image' : 'video' })
  }

  return {
    media: local ?? remote,
    loading,
    failed,
    chooseFile,
    retry: () => { setLoading(true); setAttempt(value => value + 1) }
  }
}
