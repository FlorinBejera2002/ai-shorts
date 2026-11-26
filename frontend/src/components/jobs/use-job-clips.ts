'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/auth'

/** A clip produced by one job, shown in the done state's grid. */
export interface JobClip {
  id: string
  title: string
  duration: number
  aspectRatio: string
  thumbnailUrl: string | null
  hasSubtitles: boolean
}

const jobClipsKey = (jobId: string) => ['job-clips', jobId]

/**
 * Clips of a finished job. A missing or failing endpoint yields no clips, so the done
 * state hides the count and the grid instead of showing an error for optional content.
 */
export function useJobClips(jobId: string, enabled: boolean) {
  const query = useQuery({
    queryKey: jobClipsKey(jobId),
    enabled,
    queryFn: async (): Promise<JobClip[]> => {
      const response = await apiFetch(`/api/jobs/${encodeURIComponent(jobId)}/clips`, { cache: 'no-store' })
      if (!response.ok) return []
      const data = (await response.json()) as { clips?: JobClip[] }
      return data.clips ?? []
    }
  })
  return query.data ?? []
}

async function saveClipTitle(clipId: string, title: string): Promise<string> {
  const response = await apiFetch(`/api/clips/${encodeURIComponent(clipId)}/title`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title })
  })
  if (!response.ok) throw new Error('Clip title was not saved')
  const data = (await response.json()) as { title?: string }
  return data.title ?? title
}

/**
 * Renames one of the job's clips. The grid updates at once and rolls back on failure;
 * the Clips library and dashboard refetch so they show the new title.
 */
export function useRenameJobClip(jobId: string) {
  const client = useQueryClient()
  const key = jobClipsKey(jobId)
  const setTitle = (clipId: string, title: string) =>
    client.setQueryData<JobClip[]>(key, (clips) => clips?.map((clip) => (clip.id === clipId ? { ...clip, title } : clip)))

  return useMutation({
    mutationFn: ({ clipId, title }: { clipId: string; title: string; previous: string }) => saveClipTitle(clipId, title),
    onMutate: async ({ clipId, title }) => {
      await client.cancelQueries({ queryKey: key })
      setTitle(clipId, title)
    },
    onSuccess: (title, { clipId }) => setTitle(clipId, title),
    onError: (_error, { clipId, previous }) => setTitle(clipId, previous),
    onSettled: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: ['api-resource', '/api/projects'] }),
        client.invalidateQueries({ queryKey: ['api-resource', '/api/dashboard'] })
      ])
  })
}
