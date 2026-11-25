export type FeedbackKind = 'problem' | 'idea' | 'clip'
export type FeedbackStatus = 'new' | 'in_progress' | 'resolved'
export type FeedbackStatusFilter = 'open' | FeedbackStatus | 'all'
export type ClipRating = 1 | 2 | 3

export type FeedbackItem = {
  id: number
  userId: string
  userEmail: string
  userName: string | null
  kind: FeedbackKind
  category: string
  rating: ClipRating | null
  message: string
  jobId: string | null
  page: string
  userAgent: string
  /** Short-lived signed URLs of the attached screenshots. */
  images: string[]
  status: FeedbackStatus
  createdAt: string
  updatedAt: string
}

export type FeedbackSummary = {
  open: number
  lastWeek: number
  ratingsMonth: number
  goodShareMonth: number
  badShareMonth: number
}

export type FeedbackList = { items: FeedbackItem[]; total: number; summary: FeedbackSummary }

export const kindLabels: Record<FeedbackKind, string> = { problem: 'Problemă', idea: 'Idee', clip: 'Evaluare clip' }
export const statusLabels: Record<FeedbackStatus, string> = { new: 'Nou', in_progress: 'În lucru', resolved: 'Rezolvat' }
export const ratingLabels: Record<ClipRating, string> = { 1: 'Slabe', 2: 'Ok', 3: 'Super' }
export const categoryLabels: Record<string, string> = { clips: 'Clipuri', publishing: 'Publicare', billing: 'Abonament', account: 'Cont', other: 'Altceva' }

/** One line for the list: the message, or the rating when a clip rating has no comment. */
export function feedbackHeadline(item: FeedbackItem) {
  if (item.message) return item.message
  return item.rating ? ratingLabels[item.rating] : ''
}
