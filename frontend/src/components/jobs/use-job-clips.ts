'use client'

import { useQuery } from '@tanstack/react-query'
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

/**
 * Clips of a finished job. A missing or failing endpoint yields no clips, so the done
 * state hides the count and the grid instead of showing an error for optional content.
 */
export function useJobClips(jobId: string, enabled: boolean) {
  const query = useQuery({
    queryKey: ['job-clips', jobId],
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
