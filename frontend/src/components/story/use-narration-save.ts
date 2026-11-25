import { useEffect, useRef, useState } from 'react'
import { toast } from '@/lib/toast'
import { storyRequest, uploadNarration } from './api'
import type { StoryAsset, StoryProject } from './types'
import { useStoryLanguage } from './use-story-language'

export type NarrationSaving = 'uploading' | 'validating' | null

interface UploadAttempt {
  file: File
  id: string
  reference?: string
}

interface Options {
  projectID: string
  /** The saved narration this save replaces, if any. */
  asset?: StoryAsset
  onSaved: (project: StoryProject) => Promise<unknown>
}

/**
 * Uploads a recorded or chosen narration and attaches it to the project. A failed attempt keeps
 * the upload reference so "Retry" resumes without uploading the file again.
 */
export function useNarrationSave({ projectID, asset, onSaved }: Options) {
  const text = useStoryLanguage()
  const [saving, setSaving] = useState<NarrationSaving>(null)
  const [saveFailed, setSaveFailed] = useState(false)
  const operation = useRef<AbortController | null>(null)
  const uploaded = useRef<UploadAttempt | null>(null)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      queueMicrotask(() => {
        if (!mounted.current) operation.current?.abort()
      })
    }
  }, [])

  /** Saves the draft; resolves true once the project holds the narration. */
  async function save(file: File): Promise<boolean> {
    if (operation.current) return false
    const controller = new AbortController()
    operation.current = controller
    if (uploaded.current?.file !== file) uploaded.current = { file, id: crypto.randomUUID() }
    const attempt = uploaded.current
    setSaveFailed(false)
    setSaving(attempt.reference ? 'validating' : 'uploading')
    try {
      if (!attempt.reference) attempt.reference = await uploadNarration(file, controller.signal)
      if (!mounted.current) return false
      setSaving('validating')
      const updated = await storyRequest<StoryProject>(
        `/api/stories/${projectID}/assets`,
        'POST',
        {
          id: attempt.id,
          reference: attempt.reference,
          name: file.name,
          kind: 'narration',
          ...(asset ? { replace_asset_id: asset.id } : {})
        },
        controller.signal
      )
      await onSaved(updated)
      if (mounted.current) uploaded.current = null
      return mounted.current
    } catch (cause) {
      if (mounted.current && !controller.signal.aborted) {
        setSaveFailed(true)
        toast.error(
          cause instanceof Error
            ? cause.message
            : text(
                'Could not save narration. Try again.',
                'Narațiunea nu a putut fi salvată. Încearcă din nou.'
              )
        )
      }
      return false
    } finally {
      operation.current = null
      if (mounted.current) setSaving(null)
    }
  }

  /** Drops the pending upload so the next save starts from a new file. */
  function forget() {
    uploaded.current = null
    setSaveFailed(false)
  }

  return { saving, saveFailed, save, forget, clearFailure: () => setSaveFailed(false) }
}
