import { extractApiError } from '@/lib/api-error'
import { apiFetch } from '@/lib/auth'

export const FEEDBACK_CATEGORIES = ['clips', 'publishing', 'billing', 'account', 'other'] as const
export const FEEDBACK_MESSAGE_LIMIT = 4000
/** Screenshots on a problem report or idea; the backend enforces the same limits. */
export const FEEDBACK_IMAGE_LIMIT = 3
export const FEEDBACK_IMAGE_MAX_BYTES = 5 * 1024 * 1024
export const FEEDBACK_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const

export type FeedbackKind = 'problem' | 'idea'
export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number]
export type FeedbackStatus = 'new' | 'in_progress' | 'resolved'
export type ClipRating = 1 | 2 | 3

/** One of the signed-in user's own problem reports or ideas. */
export interface FeedbackReport {
  id: number
  kind: FeedbackKind
  category: FeedbackCategory
  message: string
  status: FeedbackStatus
  images: number
  createdAt: string
}

export const FEEDBACK_REPORTS_PATH = '/api/feedback'

type FeedbackInput =
  | { kind: FeedbackKind; category: FeedbackCategory; message: string }
  | { kind: 'clip'; rating: ClipRating; jobId: string; message?: string }

/** A refused feedback request; `status` lets the form pick a localized message. */
export class FeedbackError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'FeedbackError'
    this.status = status
  }
}

/** Why a picked file cannot be attached, or null when it can. */
export function feedbackImageProblem(file: File): 'type' | 'size' | null {
  if (!(FEEDBACK_IMAGE_TYPES as readonly string[]).includes(file.type)) return 'type'
  return file.size > FEEDBACK_IMAGE_MAX_BYTES ? 'size' : null
}

/**
 * Sends feedback with the current page path (never its query string). Screenshots go as
 * multipart: the JSON payload first, then one "image" part each. Throws a FeedbackError.
 */
export async function sendFeedback(input: FeedbackInput, images: readonly File[] = []) {
  const payload = JSON.stringify({ ...input, page: window.location.pathname })
  let init: RequestInit
  if (images.length > 0) {
    const form = new FormData()
    form.append('payload', payload)
    for (const image of images) form.append('image', image, image.name)
    init = { method: 'POST', body: form }
  } else {
    init = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload }
  }
  const response = await apiFetch('/api/feedback', init)
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as Record<string, unknown>
    throw new FeedbackError(response.status, extractApiError(data, 'Feedback could not be sent'))
  }
}
