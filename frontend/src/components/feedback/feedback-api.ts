import { extractApiError } from '@/lib/api-error'
import { apiFetch } from '@/lib/auth'

export const FEEDBACK_CATEGORIES = ['clips', 'publishing', 'billing', 'account', 'other'] as const
export const FEEDBACK_MESSAGE_LIMIT = 4000

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
  createdAt: string
}

export const FEEDBACK_REPORTS_PATH = '/api/feedback'

type FeedbackInput =
  | { kind: FeedbackKind; category: FeedbackCategory; message: string }
  | { kind: 'clip'; rating: ClipRating; jobId: string; message?: string }

/** Sends feedback with the current page path (never its query string). Throws on failure. */
export async function sendFeedback(input: FeedbackInput) {
  const response = await apiFetch('/api/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...input, page: window.location.pathname })
  })
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as Record<string, unknown>
    throw new Error(extractApiError(data, 'Feedback could not be sent'))
  }
}
