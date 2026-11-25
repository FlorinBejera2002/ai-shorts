'use client'

import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useRef } from 'react'

import { useAuth } from '@/components/auth/use-auth'
import { useToast } from '@/components/ui/toast'
import { useRouter } from '@/i18n/navigation'
import { apiFetch } from '@/lib/auth'
import { importNeedsPolling, parseYouTubeImports } from './youtube-import-model'

/** While a selected video is still waiting or importing, the progress card re-reads the list this often. */
export const IMPORT_POLL_INTERVAL_MS = 5000

const RETURN_PARAM = 'youtubeImport'

async function readImports(signal?: AbortSignal) {
  const response = await apiFetch('/api/youtube/imports', { signal })
  if (!response.ok) throw new Error('imports_unavailable')
  return parseYouTubeImports(await response.json())
}

/**
 * Import list for the progress card. Polls only while the tracked import is still running with
 * items left to move, and stops as soon as the card reaches a state the user can act on.
 */
export function useYouTubeImports(enabled: boolean) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['youtube-imports', user?.id],
    queryFn: ({ signal }) => readImports(signal),
    enabled: enabled && Boolean(user),
    refetchInterval: (query) =>
      importNeedsPolling(query.state.data ?? []) ? IMPORT_POLL_INTERVAL_MS : false,
    refetchIntervalInBackground: false
  })
}

/**
 * Reads the Google export return (`?youtubeImport=success|failed|unavailable`). A failed or
 * unavailable return becomes a toast and the parameter is stripped at once. A success keeps the
 * parameter, so the progress card survives a reload, until `dismiss` removes it.
 */
export function useYouTubeImportReturn() {
  const params = useSearchParams()
  const router = useRouter()
  const t = useTranslations('create.youtubeImport')
  const toast = useToast((state) => state.add)
  const handled = useRef<string | null>(null)
  const result = params.get(RETURN_PARAM)

  const dismiss = useCallback(() => {
    const query = new URLSearchParams(params.toString())
    query.delete(RETURN_PARAM)
    const search = query.toString()
    router.replace(`/dashboard/create${search ? `?${search}` : ''}`, { scroll: false })
  }, [params, router])

  useEffect(() => {
    // Forget the last failure once its parameter is gone, so a later failed return is reported again.
    if (result !== 'failed' && result !== 'unavailable') {
      handled.current = null
      return
    }
    if (handled.current === result) return
    handled.current = result
    toast('error', t(result === 'failed' ? 'returnFailed' : 'returnUnavailable'))
    dismiss()
  }, [dismiss, result, t, toast])

  return { success: result === 'success', dismiss }
}
