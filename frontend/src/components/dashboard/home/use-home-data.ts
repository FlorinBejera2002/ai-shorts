import { useQuery } from '@tanstack/react-query'
import type { ScheduledPostRecord } from '@/lib/content-calendar'
import { apiFetch } from '@/lib/auth'
import type { PublishingData } from '@/lib/publishing'
import type { HistoryJob } from '@/types/api'

/** Job states that are still being processed (current pipeline plus legacy worker states). */
const RUNNING_STATUSES = new Set([
  'pending',
  'downloading',
  'transcribing',
  'analyzing',
  'clipping',
  'rendering',
  'detecting',
  'generating',
  'processing'
])
const RECENT_DONE_MS = 7 * 24 * 60 * 60 * 1000
const WORK_LIMIT = 2

export type HomeWorkItem =
  | { kind: 'running'; job: HistoryJob }
  | { kind: 'done'; job: HistoryJob }

async function getJson<T>(path: string): Promise<T> {
  const response = await apiFetch(path)
  if (!response.ok) throw new Error(`Request failed: ${path}`)
  return (await response.json()) as T
}

export function isRunningJob(job: HistoryJob) {
  return RUNNING_STATUSES.has(job.status)
}

/** Running jobs first, then jobs that finished in the last week with clips; at most two rows. */
export function selectWorkItems(jobs: HistoryJob[], now = Date.now()): HomeWorkItem[] {
  const running = jobs.filter(isRunningJob).map((job) => ({ kind: 'running', job }) as const)
  const done = jobs
    .filter(
      (job) =>
        job.status === 'completed' &&
        (job._count?.clips ?? 0) > 0 &&
        now - new Date(job.completedAt ?? job.createdAt).getTime() < RECENT_DONE_MS
    )
    .map((job) => ({ kind: 'done', job }) as const)
  return [...running, ...done].slice(0, WORK_LIMIT)
}

/** Jobs for "În lucru"; polls every 5 s while something is running. */
export function useHomeWork() {
  return useQuery({
    queryKey: ['home', 'work'],
    queryFn: async () => (await getJson<{ jobs: HistoryJob[] }>('/api/dashboard/history')).jobs ?? [],
    refetchInterval: (query) => (query.state.data?.some(isRunningJob) ? 5000 : false)
  })
}

/** Next scheduled posts in the coming 30 days, soonest first. */
export function useUpcomingPosts(limit = 2) {
  return useQuery({
    queryKey: ['home', 'upcoming-posts'],
    queryFn: async () => {
      const start = new Date()
      const end = new Date(start.getTime() + 30 * 24 * 60 * 60 * 1000)
      const params = new URLSearchParams({ start: start.toISOString(), end: end.toISOString() })
      const data = await getJson<{ posts: ScheduledPostRecord[] }>(`/api/calendar?${params}`)
      return (Array.isArray(data.posts) ? data.posts : [])
        .filter((post) => post.status === 'scheduled' && new Date(post.scheduledAt).getTime() >= start.getTime())
        .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())
        .slice(0, limit)
    }
  })
}

/** What a new account has already done, from real data (brand kit, connected networks, scheduled posts). */
export function useFirstSteps(enabled: boolean) {
  return useQuery({
    queryKey: ['home', 'first-steps'],
    enabled,
    queryFn: async () => {
      const [brand, publishing, posts] = await Promise.allSettled([
        getJson<{ brandKit?: unknown }>('/api/user/brand'),
        getJson<PublishingData>('/api/publishing'),
        getJson<{ posts: ScheduledPostRecord[] }>(
          `/api/calendar?${new URLSearchParams({
            start: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString(),
            end: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
          })}`
        )
      ])
      return {
        brandKit: brand.status === 'fulfilled' && Boolean(brand.value.brandKit),
        networks: publishing.status === 'fulfilled' && (publishing.value.accounts ?? []).length > 0,
        scheduled: posts.status === 'fulfilled' && (posts.value.posts ?? []).some((post) => post.status !== 'draft')
      }
    }
  })
}
