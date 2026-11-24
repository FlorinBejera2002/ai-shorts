export type ErrorSource = 'api' | 'worker' | 'web' | 'admin'
export type ErrorState = 'open' | 'resolved' | 'all'

export type ErrorGroup = {
  id: number
  source: ErrorSource
  kind: 'http' | 'log' | 'client'
  message: string
  route: string
  occurrences: number
  lastDay: number
  firstSeenAt: string
  lastSeenAt: string
  resolvedAt: string | null
}

export type ErrorSummary = {
  open: number
  lastDay: number
  newLastDay: number
  sourceLastDay: Record<ErrorSource, number>
}

export type ErrorList = { items: ErrorGroup[]; total: number; summary: ErrorSummary }

export type ErrorEvent = {
  id: number
  occurredAt: string
  occurrences: number
  detail: string
  context: Record<string, string>
}

export type ErrorDetail = { group: ErrorGroup; events: ErrorEvent[] }

export const sourceLabels: Record<ErrorSource, string> = {
  api: 'API',
  worker: 'Worker',
  web: 'Web',
  admin: 'Admin'
}
