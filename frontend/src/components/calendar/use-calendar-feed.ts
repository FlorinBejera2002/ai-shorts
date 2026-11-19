'use client'

import type { CalendarClipOption, ScheduledPostRecord } from '@/lib/content-calendar'
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import type { PublishingPeriod } from './calendar-period'
import { type CalendarResponse, requestJson } from './calendar-request'
import { CalendarRequestError, normalizeScheduledPost } from './calendar-utils'

export type CalendarLoadError = 'auth' | 'rateLimit' | 'load'

type CalendarFeed = {
  posts: ScheduledPostRecord[]
  clips: CalendarClipOption[]
  truncatedLimit: number | null
}

const NO_POSTS: ScheduledPostRecord[] = []
const NO_CLIPS: CalendarClipOption[] = []

async function fetchCalendar(start: string, end: string, signal: AbortSignal): Promise<CalendarFeed> {
  const params = new URLSearchParams({ start, end })
  const data = await requestJson<CalendarResponse>(`/api/calendar?${params}`, { signal, cache: 'no-store' })
  if (!Array.isArray(data.posts) || !Array.isArray(data.clips)) {
    throw new CalendarRequestError('Invalid calendar response', 500)
  }
  return {
    posts: data.posts.map(normalizeScheduledPost),
    clips: data.clips,
    truncatedLimit: data.meta?.truncated ? (data.meta.limit ?? 500) : null
  }
}

/** Polls while a post is publishing, and again just after the next scheduled post is due. */
function nextRefreshDelay(posts: ScheduledPostRecord[]): number | false {
  if (posts.some((post) => post.status === 'publishing')) return 5_000
  const nextScheduledAt = posts
    .filter((post) => post.status === 'scheduled')
    .map((post) => new Date(post.scheduledAt).getTime())
    .filter((scheduledAt) => Number.isFinite(scheduledAt))
    .sort((left, right) => left - right)[0]
  if (nextScheduledAt === undefined) return false
  return Math.max(1_000, Math.min(2_147_000_000, nextScheduledAt - Date.now() + 1_000))
}

function loadErrorKey(error: unknown): CalendarLoadError | null {
  if (!error) return null
  if (error instanceof CalendarRequestError && error.status === 401) return 'auth'
  if (error instanceof CalendarRequestError && error.status === 429) return 'rateLimit'
  return 'load'
}

/** Posts and clips for the visible publishing period, with optimistic local updates after mutations. */
export function useCalendarFeed(period: PublishingPeriod) {
  const queryClient = useQueryClient()
  const start = period.start.toISOString()
  const end = period.end.toISOString()
  const queryKey = ['publishing-calendar', start, end] as const
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) => fetchCalendar(start, end, signal),
    placeholderData: keepPreviousData,
    refetchInterval: (current) => nextRefreshDelay(current.state.data?.posts ?? NO_POSTS)
  })

  /** Applies a local change, drops any in-flight stale load, then refetches the range. */
  async function updatePosts(change: (posts: ScheduledPostRecord[]) => ScheduledPostRecord[]) {
    await queryClient.cancelQueries({ queryKey })
    queryClient.setQueryData<CalendarFeed>(queryKey, (current) =>
      current ? { ...current, posts: change(current.posts) } : current
    )
    void queryClient.invalidateQueries({ queryKey })
  }

  return {
    posts: query.data?.posts ?? NO_POSTS,
    clips: query.data?.clips ?? NO_CLIPS,
    truncatedLimit: query.data?.truncatedLimit ?? null,
    hasLoaded: query.data !== undefined,
    loading: query.isFetching,
    loadError: query.isFetching ? null : loadErrorKey(query.error),
    retry: () => void query.refetch(),
    updatePosts
  }
}
