import { useQuery } from '@tanstack/react-query'
import { storyRequest } from './api'
import type { MusicTrack } from './types'

export function useStoryMusicTrack(id?: string) {
  return useQuery({
    queryKey: ['music-track', id],
    enabled: Boolean(id),
    staleTime: 10 * 60 * 1000,
    retry: 1,
    queryFn: ({ signal }) =>
      storyRequest<MusicTrack>(
        `/api/music/${encodeURIComponent(id!)}`,
        'GET',
        undefined,
        signal
      )
  })
}

export function useStoryMusicCatalog(query: string, page: number, enabled: boolean) {
  return useQuery({
    queryKey: ['music-catalog', query, page],
    enabled,
    staleTime: 10 * 60 * 1000,
    retry: 1,
    queryFn: ({ signal }) =>
      storyRequest<{
        tracks: MusicTrack[]
        total: number
        page: number
        has_more: boolean
      }>(
        `/api/music?${new URLSearchParams({ query, page: String(page), limit: '24' })}`,
        'GET',
        undefined,
        signal
      )
  })
}
