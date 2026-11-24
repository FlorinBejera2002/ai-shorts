import { useCallback, useRef, useState } from 'react'
import { toast } from '@/lib/toast'
import { StoryRequestError, storyRequest } from './api'
import { storyProblem } from './story-error'
import type { StoryProject } from './types'
import type { StoryRefresh } from './use-story-project-query'
import { useStoryLanguage } from './use-story-language'
import type { StoryText } from './story-workspace-model'

/** Actions whose retries reuse one request id, so the server applies them once. */
const IDEMPOTENT_PATHS = ['/generate', '/retry', '/transcript-review']

function reportMutationFailure(cause: unknown, text: StoryText) {
  if (cause instanceof StoryRequestError && cause.status === 409) {
    toast.error(
      text(
        'The project changed. Your choices are kept. Review them and apply again.',
        'Proiectul s-a schimbat. Alegerile tale sunt păstrate. Verifică-le și aplică din nou.'
      )
    )
    return
  }
  toast.error(
    cause instanceof Error
      ? storyProblem(cause.message, text)
      : text('The action failed. Try again.', 'Acțiunea a eșuat. Încearcă din nou.')
  )
}

/**
 * Runs one project request at a time and owns the workspace's last error message.
 * A rejected action is never replayed automatically against new media.
 */
export function useStoryMutation(projectID: string, refresh: StoryRefresh) {
  const text = useStoryLanguage()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const inFlight = useRef(false)
  const requestIDs = useRef(new Map<string, string>())

  async function mutate(
    path: string,
    method: string,
    payload?: Record<string, unknown>
  ) {
    if (inFlight.current) return false
    inFlight.current = true
    setBusy(true)
    setError('')
    try {
      const signature = JSON.stringify({ path, payload })
      const idempotent = IDEMPOTENT_PATHS.includes(path)
      let requestID = requestIDs.current.get(signature)
      if (idempotent && !requestID) {
        requestID = crypto.randomUUID()
        requestIDs.current.set(signature, requestID)
      }
      const updated = await storyRequest<StoryProject>(
        `/api/stories/${projectID}${path}`,
        method,
        idempotent ? { ...payload, request_id: requestID } : payload
      )
      requestIDs.current.delete(signature)
      if (method !== 'DELETE' || path !== '') await refresh(updated)
      return true
    } catch (cause) {
      reportMutationFailure(cause, text)
      if (cause instanceof StoryRequestError && cause.status === 409) {
        // Fetch the new guard/state, but keep local options and transcript drafts.
        await refresh()
      }
      return false
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  const isMutating = useCallback(() => inFlight.current, [])

  return { busy, error, setError, mutate, isMutating }
}
