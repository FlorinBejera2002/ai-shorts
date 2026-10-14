import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/lib/auth'

type MediaCapabilities = { audio_cleanup?: { available?: boolean } }

export function useAudioCleanupAvailability() {
  const query = useQuery({
    queryKey: ['media-capabilities'],
    queryFn: async () => {
      const response = await apiFetch('/api/media-capabilities')
      if (!response.ok) throw new Error('Media capabilities unavailable')
      return (await response.json()) as MediaCapabilities
    },
    staleTime: 60_000,
    retry: false
  })
  return {
    available: !query.isError && query.data?.audio_cleanup?.available === true,
    loading: query.isPending
  }
}
