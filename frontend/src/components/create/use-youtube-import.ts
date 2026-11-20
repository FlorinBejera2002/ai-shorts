'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocale, useTranslations } from 'next-intl'
import { useEffect, useRef, useState } from 'react'

import { useAuth } from '@/components/auth/use-auth'
import { toast } from '@/lib/toast'
import { apiFetch } from '@/lib/auth'

export type YouTubeVisibility = 'public' | 'unlisted' | 'private'
export type YouTubeImportStatus =
  | 'authorizing'
  | 'queued'
  | 'exporting'
  | 'importing'
  | 'ready'
  | 'failed'
  | 'cancelled'

export interface YouTubeImport {
  id: string
  status: YouTubeImportStatus
  visibilities: YouTubeVisibility[]
  created_at: string
  updated_at: string
  error?: string
  video_count: number
}

export interface ImportedYouTubeVideo {
  id: string
  import_id: string
  title: string
  file_name: string
  file_size: number
  source_storage_key: string
  created_at: string
}

interface ImportLibrary {
  enabled: boolean
  imports: YouTubeImport[]
  videos: ImportedYouTubeVideo[]
}

export function isActiveYouTubeImport(status: YouTubeImportStatus) {
  return ['authorizing', 'queued', 'exporting', 'importing'].includes(status)
}

async function readLibrary(signal: AbortSignal): Promise<ImportLibrary> {
  const response = await apiFetch('/api/youtube/imports', { signal })
  if (!response.ok) throw new Error('library_unavailable')
  const data: ImportLibrary = await response.json()
  if (
    typeof data.enabled !== 'boolean' ||
    !Array.isArray(data.imports) ||
    !Array.isArray(data.videos)
  ) {
    throw new Error('invalid_library_response')
  }
  return data
}

export function useYouTubeImport(active: boolean) {
  const { user } = useAuth()
  const locale = useLocale()
  const t = useTranslations('create.youtubeImport')
  const queryClient = useQueryClient()
  const queryKey = ['youtube-imports', user?.id] as const
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const activeConnection = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!active) activeConnection.current?.abort()
    return () => activeConnection.current?.abort()
  }, [active])
  const library = useQuery({
    queryKey,
    queryFn: ({ signal }) => readLibrary(signal),
    enabled: active && Boolean(user),
    refetchOnWindowFocus: active,
    refetchIntervalInBackground: false,
    refetchInterval: (query) =>
      active &&
      query.state.data?.imports.some((item) => isActiveYouTubeImport(item.status))
        ? 6000
        : false
  })

  const connect = useMutation({
    mutationFn: async (visibilities: YouTubeVisibility[]) => {
      activeConnection.current?.abort()
      const controller = new AbortController()
      activeConnection.current = controller
      const response = await apiFetch('/api/youtube/imports/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visibilities, consent: true, locale }),
        signal: controller.signal
      })
      if (!response.ok) throw new Error('connection_failed')
      const data: { url?: string } = await response.json()
      const url = new URL(data.url ?? '')
      if (
        url.protocol !== 'https:' ||
        url.hostname !== 'accounts.google.com' ||
        url.port ||
        url.username ||
        url.password
      ) {
        throw new Error('invalid_authorization_url')
      }
      return url.href
    },
    onSuccess: (url) => {
      if (!activeConnection.current?.signal.aborted) window.location.assign(url)
    },
    onError: () => {
      if (!activeConnection.current?.signal.aborted) toast.error(t('connectionFailed'))
    }
  })

  const remove = useMutation({
    mutationFn: async ({ id, type }: { id: string; type: 'import' | 'video' }) => {
      const endpoint = type === 'video' ? 'import-videos' : 'imports'
      const response = await apiFetch(`/api/youtube/${endpoint}/${encodeURIComponent(id)}`, {
        method: 'DELETE'
      })
      if (!response.ok) throw new Error('removal_failed')
      return { id, type }
    },
    onSuccess: async ({ id, type }) => {
      if (type === 'video' && selectedId === id) setSelectedId(null)
      await queryClient.invalidateQueries({ queryKey })
    },
    onError: () => {
      toast.error(t('removalFailed'))
    }
  })

  const videos = library.data?.videos ?? []
  const selectedVideo = videos.find((video) => video.id === selectedId) ?? null

  return {
    enabled: library.data?.enabled ?? false,
    imports: library.data?.imports ?? [],
    videos,
    selectedVideo,
    selectVideo: setSelectedId,
    loading: library.isPending,
    refreshing: library.isFetching,
    loadFailed: library.isError,
    refresh: () => library.refetch(),
    connect: (visibilities: YouTubeVisibility[]) => connect.mutate(visibilities),
    connecting: connect.isPending,
    remove: (id: string, type: 'import' | 'video') => remove.mutate({ id, type }),
    removing: remove.isPending
  }
}

export type YouTubeImportLibrary = ReturnType<typeof useYouTubeImport>
