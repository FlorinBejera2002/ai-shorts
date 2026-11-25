'use client'

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocale, useTranslations } from 'next-intl'
import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'

import { useAuth } from '@/components/auth/use-auth'
import { useToast } from '@/components/ui/toast'
import { useRouter } from '@/i18n/navigation'
import { apiFetch } from '@/lib/auth'
import {
  isGoogleAuthorizationUrl,
  visibilityQueryParam,
  type LibraryVisibilityFilter
} from './youtube-creation-model'

export interface YouTubeChannelAccount {
  channel_id: string
  title: string
  avatar_url: string | null
}

export interface YouTubeChannelStatus {
  /** False when Google OAuth for the YouTube channel feature is not configured. */
  enabled: boolean
  connected: boolean
  account: YouTubeChannelAccount | null
}

export interface YouTubeChannelVideo {
  id: string
  title: string
  duration_seconds: number
  published_at: string
  visibility: 'public' | 'unlisted' | 'private'
  thumbnail_url: string | null
  url: string
}

interface ChannelVideosPage {
  videos: YouTubeChannelVideo[]
  next_page_token: string | null
}

const UNAVAILABLE_STATUS: YouTubeChannelStatus = { enabled: false, connected: false, account: null }

async function readChannelStatus(signal?: AbortSignal): Promise<YouTubeChannelStatus> {
  const response = await apiFetch('/api/youtube/channel', { signal })
  if (!response.ok) throw new Error('channel_unavailable')
  const data: Partial<YouTubeChannelStatus> = await response.json()
  return {
    enabled: data.enabled === true,
    connected: data.connected === true,
    account: data.account ?? null
  }
}

async function readChannelVideos(
  query: string,
  visibility: LibraryVisibilityFilter,
  pageToken: string | null,
  signal?: AbortSignal
): Promise<ChannelVideosPage> {
  const params = new URLSearchParams({ visibility: visibilityQueryParam(visibility) })
  if (query.trim()) params.set('q', query.trim())
  if (pageToken) params.set('page_token', pageToken)
  const response = await apiFetch(`/api/youtube/channel/videos?${params.toString()}`, { signal })
  if (!response.ok) throw new Error(response.status === 409 ? 'not_connected' : 'videos_unavailable')
  const data: Partial<ChannelVideosPage> = await response.json()
  return {
    videos: Array.isArray(data.videos) ? data.videos : [],
    next_page_token: typeof data.next_page_token === 'string' ? data.next_page_token : null
  }
}

/** Shared channel connection state; the account pill and the workflow read the same query. */
export function useYouTubeChannel(active = true) {
  const { user } = useAuth()
  const locale = useLocale()
  const queryClient = useQueryClient()
  const t = useTranslations('create.youtubeChannel')
  const toast = useToast((state) => state.add)
  const queryKey = ['youtube-channel', user?.id] as const

  const status = useQuery({
    queryKey,
    queryFn: ({ signal }) => readChannelStatus(signal),
    enabled: active && Boolean(user)
  })

  const connect = useMutation({
    mutationFn: async () => {
      const response = await apiFetch('/api/youtube/channel/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locale, consent: true })
      })
      if (!response.ok) throw new Error('connect_failed')
      const data: { url?: string } = await response.json()
      if (!isGoogleAuthorizationUrl(data.url)) throw new Error('invalid_authorization_url')
      return data.url
    },
    onSuccess: (url) => window.location.assign(url),
    onError: () => toast('error', t('connectFailed'))
  })

  const disconnect = useMutation({
    mutationFn: async () => {
      const response = await apiFetch('/api/youtube/channel', { method: 'DELETE' })
      if (!response.ok) throw new Error('disconnect_failed')
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['youtube-channel'] }),
    onError: () => toast('error', t('disconnectFailed'))
  })

  return {
    status: status.data ?? UNAVAILABLE_STATUS,
    isPending: status.isPending,
    isError: status.isError,
    refetch: () => status.refetch(),
    connect: () => connect.mutate(),
    connecting: connect.isPending,
    disconnect: () => disconnect.mutate(),
    disconnecting: disconnect.isPending
  }
}

/** Live list of the connected channel's videos, paged by `next_page_token`. */
export function useYouTubeChannelVideos(query: string, visibility: LibraryVisibilityFilter, enabled: boolean) {
  const { user } = useAuth()
  const videos = useInfiniteQuery({
    queryKey: ['youtube-channel-videos', user?.id, query.trim(), visibility],
    queryFn: ({ pageParam, signal }) => readChannelVideos(query, visibility, pageParam, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.next_page_token,
    enabled: enabled && Boolean(user)
  })

  const pages = videos.data?.pages ?? []
  return {
    videos: pages.flatMap((page) => page.videos),
    hasMore: videos.hasNextPage,
    loadingMore: videos.isFetchingNextPage,
    loadMore: () => void videos.fetchNextPage(),
    isPending: videos.isPending,
    isError: videos.isError,
    notConnected: videos.error instanceof Error && videos.error.message === 'not_connected',
    retry: () => void videos.refetch()
  }
}

const SEARCH_DEBOUNCE_MS = 300

/**
 * Search, visibility filter and paging for the channel's video list. Only the debounced search
 * text is requested, so typing does not fire a request per keystroke.
 */
export function useYouTubeLibrary(enabled: boolean) {
  const [searchText, setSearchText] = useState('')
  const [query, setQuery] = useState('')
  const [visibility, setVisibility] = useState<LibraryVisibilityFilter>('all')

  useEffect(() => {
    const timer = setTimeout(() => setQuery(searchText), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [searchText])

  const videos = useYouTubeChannelVideos(query, visibility, enabled)
  return { ...videos, searchText, setSearchText, query, visibility, setVisibility }
}

export type YouTubeLibrary = ReturnType<typeof useYouTubeLibrary>

/**
 * Turns the OAuth return (`?youtubeChannel=success|error`) into a toast, strips the parameter and
 * refreshes the connection state. Runs once per return value.
 */
export function useYouTubeChannelReturn() {
  const params = useSearchParams()
  const router = useRouter()
  const queryClient = useQueryClient()
  const t = useTranslations('create.youtubeChannel')
  const toast = useToast((state) => state.add)
  const handled = useRef<string | null>(null)
  const result = params.get('youtubeChannel')

  useEffect(() => {
    if (!result || handled.current === result) return
    handled.current = result
    if (result === 'success') void queryClient.invalidateQueries({ queryKey: ['youtube-channel'] })
    toast(result === 'success' ? 'success' : 'error', t(result === 'success' ? 'connected' : 'connectFailed'))
    const query = new URLSearchParams(params.toString())
    query.delete('youtubeChannel')
    const search = query.toString()
    router.replace(`/dashboard/create${search ? `?${search}` : ''}`, { scroll: false })
  }, [params, queryClient, result, router, t, toast])
}
