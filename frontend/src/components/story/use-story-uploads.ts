import { useCallback, useEffect, useRef, useState } from 'react'
import { storyRequest, uploadStoryFile } from './api'
import type { StoryProject } from './types'

export interface PendingUpload {
  id: string
  projectId: string
  file: File
  preview: string
  status: 'queued' | 'uploading' | 'validating' | 'failed' | 'complete'
  bytes: number
  order: number
  reference?: string
  error?: string
  retryAt?: number
  duration?: number
}

/** Two transfers, with up to two more files waiting for server validation. */
export function useStoryUploads(
  projectID: string,
  refresh: (project?: StoryProject) => Promise<unknown>
) {
  const [items, setItems] = useState<PendingUpload[]>([])
  const active = useRef(new Map<string, AbortController>())
  const transferring = useRef(new Set<string>())
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
    // Validation can decode a long source. Keep uploading the next files while
    // it runs, but bound the overall pipeline so a large batch cannot flood it.
    const available = Math.max(0, Math.min(2 - transferring.current.size, 4 - active.current.size))
    for (const item of items
      .filter((item) => item.status === 'queued' && item.projectId)
      .slice(0, available)) {
      if (active.current.has(item.id)) continue
      const controller = new AbortController()
      active.current.set(item.id, controller)
      if (!item.reference) transferring.current.add(item.id)
      update(item.id, {
        status: item.reference ? 'validating' : 'uploading',
        error: undefined
      })
      void (async () => {
        try {
          const retryBusy = async <T,>(operation: () => Promise<T>): Promise<T> => {
            for (;;) {
              try { return await operation() } catch (error) {
                const seconds = typeof error === 'object' && error !== null && 'retryAfterSeconds' in error ? Number(error.retryAfterSeconds) : 0
                if (!seconds || controller.signal.aborted) throw error
                update(item.id, { retryAt: Date.now() + seconds * 1000 })
                await new Promise<void>((resolve, reject) => {
                  const cancel = () => { clearTimeout(timer); reject(new DOMException('Upload cancelled', 'AbortError')) }
                  const timer = setTimeout(() => { controller.signal.removeEventListener('abort', cancel); resolve() }, seconds * 1000)
                  controller.signal.addEventListener('abort', cancel, { once: true })
                })
                update(item.id, { retryAt: undefined })
              }
            }
          }
          const reference = item.reference ?? await retryBusy(() => uploadStoryFile(item.file, controller.signal, (bytes) => update(item.id, { bytes })))
          transferring.current.delete(item.id)
          if (controller.signal.aborted) return
          update(item.id, { reference, bytes: item.file.size, status: 'validating' })
          const registered = await retryBusy(() => storyRequest<StoryProject>(
            `/api/stories/${item.projectId}/assets`,
            'POST',
            {
              id: item.id,
              reference,
              name: item.file.name,
              order: item.order
            },
            controller.signal
          ))
          if (!controller.signal.aborted) {
            // Registration is the server's validation acknowledgement, not the byte transfer.
            await refresh(registered)
            const preview = urls.current.get(item.id)
            if (preview) URL.revokeObjectURL(preview)
            urls.current.delete(item.id)
            update(item.id, { status: 'complete', preview: '', retryAt: undefined })
          }
        } catch (error) {
          if (mounted.current && !controller.signal.aborted)
            update(item.id, {
              status: 'failed',
              error: error instanceof Error ? error.message : 'Upload failed'
            })
        } finally {
          transferring.current.delete(item.id)
          active.current.delete(item.id)
          // Wake the remaining queue even after an aborted transfer.
          if (mounted.current) setItems((current) => [...current])
        }
      })()
    }
  }, [items, refresh, update])

  const add = useCallback((files: File[], startingOrder = 0) => {
    if (!projectID) return
    nextOrder.current = Math.max(nextOrder.current, startingOrder)
    const additions = files.map((file): PendingUpload => {
      const id = crypto.randomUUID()
      const preview = URL.createObjectURL(file)
      urls.current.set(id, preview)
      return {
        id,
        projectId: projectID,
        file,
        preview,
        status: 'queued',
        bytes: 0,
        order: nextOrder.current++
      }
    })
    setItems((current) => [...current, ...additions])
  }, [projectID])

  const forget = useCallback((id: string) => {
    active.current.get(id)?.abort()
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
