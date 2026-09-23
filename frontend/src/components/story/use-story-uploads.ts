import { useCallback, useEffect, useRef, useState } from 'react'
import { storyRequest, uploadStoryFile } from './api'
import type { StoryProject } from './types'

export interface PendingUpload {
  id: string
  file: File
  preview: string
  status: 'queued' | 'uploading' | 'validating' | 'failed' | 'complete'
  bytes: number
  order: number
  reference?: string
  error?: string
  duration?: number
}

/** Two transfers at a time, independently retryable with stable asset identities. */
export function useStoryUploads(
  projectID: string,
  refresh: (project?: StoryProject) => Promise<unknown>
) {
  const [items, setItems] = useState<PendingUpload[]>([])
  const active = useRef(new Map<string, AbortController>())
  const urls = useRef(new Map<string, string>())
  const mounted = useRef(true)
  const nextOrder = useRef(0)

  const update = useCallback((id: string, patch: Partial<PendingUpload>) => {
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item))
    )
  }, [])

  useEffect(() => {
    mounted.current = true
    const controllers = active.current
    const previews = urls.current
    return () => {
      mounted.current = false
      // Fast Refresh and Strict Mode immediately reconnect this effect. Keep
      // their live transfers and object URLs; dispose only on a real unmount.
      queueMicrotask(() => {
        if (mounted.current) return
        controllers.forEach((controller) => controller.abort())
        controllers.clear()
        previews.forEach((url) => URL.revokeObjectURL(url))
        previews.clear()
      })
    }
  }, [])

  useEffect(() => {
    if (!projectID) return
    const available = 2 - active.current.size
    for (const item of items
      .filter((item) => item.status === 'queued')
      .slice(0, available)) {
      if (active.current.has(item.id)) continue
      const controller = new AbortController()
      active.current.set(item.id, controller)
      update(item.id, {
        status: item.reference ? 'validating' : 'uploading',
        error: undefined
      })
      void (async () => {
        try {
          const reference =
            item.reference ??
            (await uploadStoryFile(item.file, controller.signal, (bytes) =>
              update(item.id, { bytes })
            ))
          if (controller.signal.aborted) return
          update(item.id, { reference, bytes: item.file.size, status: 'validating' })
          const registered = await storyRequest<StoryProject>(
            `/api/stories/${projectID}/assets`,
            'POST',
            {
              id: item.id,
              reference,
              name: item.file.name,
              order: item.order
            },
            controller.signal
          )
          if (!controller.signal.aborted) {
            // Registration is the server's validation acknowledgement, not the byte transfer.
            await refresh(registered)
            update(item.id, { status: 'complete' })
          }
        } catch (error) {
          if (mounted.current && !controller.signal.aborted)
            update(item.id, {
              status: 'failed',
              error: error instanceof Error ? error.message : 'Upload failed'
            })
        } finally {
          active.current.delete(item.id)
          // Wake the remaining queue even after an aborted transfer.
          if (mounted.current) setItems((current) => [...current])
        }
      })()
    }
  }, [items, projectID, refresh, update])

  const add = useCallback((files: File[], startingOrder = 0) => {
    nextOrder.current = Math.max(nextOrder.current, startingOrder)
    const additions = files.map((file): PendingUpload => {
      const id = crypto.randomUUID()
      const preview = URL.createObjectURL(file)
      urls.current.set(id, preview)
      return {
        id,
        file,
        preview,
        status: 'queued',
        bytes: 0,
        order: nextOrder.current++
      }
    })
    setItems((current) => [...current, ...additions])
  }, [])

  const forget = useCallback((id: string) => {
    active.current.get(id)?.abort()
    active.current.delete(id)
    const url = urls.current.get(id)
    if (url) URL.revokeObjectURL(url)
    urls.current.delete(id)
    setItems((current) => current.filter((item) => item.id !== id))
  }, [])

  const retry = useCallback((id?: string) => {
    setItems((current) =>
      current.map((item) =>
        item.status === 'failed' && (!id || item.id === id)
          ? { ...item, status: 'queued', error: undefined }
          : item
      )
    )
  }, [])

  return {
    items,
    add,
    forget,
    retry,
    update,
    busy: items.some((item) =>
      ['queued', 'uploading', 'validating'].includes(item.status)
    )
  }
}
