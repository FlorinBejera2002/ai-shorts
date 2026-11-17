'use client'

import { useRouter } from '@/i18n/navigation'
import type { ClipsLibraryQuery } from '@/lib/clips-library'
import { useSearchParams } from 'next/navigation'

export type ClipsFilterValues = Pick<
  ClipsLibraryQuery,
  'score' | 'aspect' | 'subtitles' | 'sort'
>

export const defaultClipsFilters: ClipsFilterValues = {
  score: 'all',
  aspect: 'all',
  subtitles: 'all',
  sort: 'newest'
}

/** Writes the Clips library filters to the URL, resetting pagination. */
export function useClipsFilters() {
  const router = useRouter()
  const searchParams = useSearchParams()

  function replaceFilters(changes: Partial<Record<keyof ClipsLibraryQuery, string>>) {
    const params = new URLSearchParams(searchParams.toString())
    for (const [name, value] of Object.entries(changes)) {
      const defaultValue = name === 'sort' ? 'newest' : 'all'
      if (!value || (name !== 'search' && value === defaultValue))
        params.delete(name)
      else params.set(name, value)
    }
    params.delete('page')
    const search = params.toString()
    router.replace(`/dashboard/clips${search ? `?${search}` : ''}`, {
      scroll: false
    })
  }

  function clearFilters() {
    replaceFilters({ search: '', ...defaultClipsFilters })
  }

  return { replaceFilters, clearFilters }
}

export function countActiveClipFilters(query: ClipsFilterValues) {
  return [query.score, query.aspect, query.subtitles].filter(
    (value) => value !== 'all'
  ).length
}
