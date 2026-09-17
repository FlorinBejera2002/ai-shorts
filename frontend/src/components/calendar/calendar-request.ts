import { apiFetch } from '@/lib/auth'
import type {
  CalendarClipOption,
  ScheduledPostRecord
} from '@/lib/content-calendar'
import { CalendarRequestError } from './calendar-utils'

export type CalendarResponse = {
  posts: ScheduledPostRecord[]
  clips: CalendarClipOption[]
  meta?: { truncated: boolean; limit: number }
}

export type PostResponse = { post: ScheduledPostRecord }

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export async function requestJson<Response>(
  url: string,
  init?: RequestInit
): Promise<Response> {
  const response = await apiFetch(url, init)
  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const message =
      isObject(body) && typeof body.error === 'string'
        ? body.error
        : 'Calendar request failed'
    const issues =
      isObject(body) && Array.isArray(body.issues)
        ? body.issues.filter(
            (issue): issue is { field: string; message: string } =>
              isObject(issue) &&
              typeof issue.field === 'string' &&
              typeof issue.message === 'string'
          )
        : []
    throw new CalendarRequestError(message, response.status, issues)
  }
  return body as Response
}
