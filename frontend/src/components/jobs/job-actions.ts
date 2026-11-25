import { extractApiError } from '@/lib/api-error'
import { apiFetch } from '@/lib/auth'

/** A refused job action; `status` lets the caller pick a localized message instead of the server text. */
export class JobActionError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'JobActionError'
    this.status = status
  }
}

/** Cancels a running YouTube job. Throws a JobActionError on failure. */
export async function cancelJob(jobId: string) {
  const response = await apiFetch(`/api/jobs/${jobId}/cancel`, { method: 'POST' })
  const data = await response.json()
  if (!response.ok) throw new JobActionError(response.status, extractApiError(data, 'Cancel failed'))
}

/**
 * Retries a failed or cancelled job. `keepOriginalAudio` continues without the
 * audio cleanup step. The caller reuses one request id while a retry is in flight.
 * Legacy link jobs answer 409 and cannot be retried; the caller shows a localized message for that.
 */
export async function retryJob(
  jobId: string,
  requestId: string,
  options: { keepOriginalAudio?: boolean } = {}
) {
  const response = await apiFetch(`/api/jobs/${jobId}/retry`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      request_id: requestId,
      ...(options.keepOriginalAudio ? { audio_cleanup: { enabled: false } } : {})
    })
  })
  const data = await response.json()
  if (!response.ok) throw new JobActionError(response.status, extractApiError(data, 'Retry failed'))
}
