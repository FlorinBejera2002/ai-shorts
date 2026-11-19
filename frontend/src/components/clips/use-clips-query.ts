'use client'

import { useRouter } from '@/i18n/navigation'
import { clipsHref, parseClipsQuery, type ClipsQuery } from '@/lib/clips-library'
import { useSearchParams } from 'next/navigation'
import { useMemo } from 'react'

function currentQuery() {
  return parseClipsQuery(Object.fromEntries(new URLSearchParams(window.location.search)))
}

/** The Clips page state lives in the URL, so Back/Forward and shared links restore it. */
export function useClipsQuery() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const query = useMemo(() => parseClipsQuery(Object.fromEntries(searchParams)), [searchParams])

  // Read the URL at call time: quick successive changes (typing, then a filter) must not
  // build on a query captured before the previous change rendered.
  function update(changes: Partial<ClipsQuery>) {
    router.replace(clipsHref(currentQuery(), changes), { scroll: false })
  }

  function clearFilters() {
    update({ search: '', aspect: 'all', subtitles: 'all' })
  }

  return { query, update, clearFilters, href: (changes: Partial<ClipsQuery>) => clipsHref(query, changes) }
}
