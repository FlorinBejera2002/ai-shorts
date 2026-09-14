'use client'

import '@/components/clips/media-workbench.css'

import { ApiState } from '@/components/shared/api-state'
import { Button } from '@/components/ui/button'
import { useApiResource } from '@/hooks/use-api-resource'
import type { ClipLibraryData } from '@/types/api'
import { Film, Plus, SearchX } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

import { ClipCard } from '@/components/clips/clip-card'
import { ClipsLibraryToolbar } from '@/components/clips/clips-library-toolbar'
import { ClipsPagination } from '@/components/clips/clips-pagination'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { Link } from '@/i18n/navigation'
import {
  CLIPS_PAGE_SIZE,
  clipsLibraryHref,
  hasActiveClipFilters,
  parseClipsLibraryQuery
} from '@/lib/clips-library'

export default function ClipsPage() {
  return (
    <Suspense fallback={<ApiState />}>
      <ClipsPageContent />
    </Suspense>
  )
}

function ClipsPageContent() {
  const locale = useLocale()
  const t = useTranslations('clips')
  const searchParams = useSearchParams()
  const query = parseClipsLibraryQuery(Object.fromEntries(searchParams))
  const apiQuery = new URLSearchParams(
    Object.entries(query).map(([key, value]) => [key, String(value)])
  )
  const { data, error, reload } = useApiResource<ClipLibraryData>(
    `/api/clips/library?${apiQuery}`
  )
  if (!data) return <ApiState error={error} retry={reload} />
  const { clips, total, totalPages, currentPage } = data

  const firstResult = total === 0 ? 0 : (currentPage - 1) * CLIPS_PAGE_SIZE + 1
  const lastResult = Math.min(total, currentPage * CLIPS_PAGE_SIZE)
  const filtersActive = hasActiveClipFilters(query)

  return (
    <div className="media-workbench dashboard-workspace animate-fade-in">
      <PageHeader
        title={t('title')}
        description={t('count', { count: total })}
        actions={
          <Button
            asChild={true}
            variant="default"
            className="clips-create-action"
          >
            <Link href="/dashboard/create">
              <Plus aria-hidden="true" className="size-4" strokeWidth={2} />
              {t('createClip')}
            </Link>
          </Button>
        }
      />

      <ClipsLibraryToolbar
        showSearch={total > 15 || filtersActive}
        query={query}
        labels={{
          search: t('searchLabel'),
          searchPlaceholder: t('searchPlaceholder'),
          score: t('scoreLabel'),
          aspect: t('aspectLabel'),
          subtitles: t('subtitlesLabel'),
          sort: t('sortLabel'),
          apply: t('applyFilters'),
          clear: t('clearFilters')
        }}
        scoreOptions={[
          { value: 'all', label: t('scoreAll') },
          { value: 'high', label: t('scoreHigh') },
          { value: 'promising', label: t('scorePromising') },
          { value: 'low', label: t('scoreLow') }
        ]}
        aspectOptions={[
          { value: 'all', label: t('aspectAll') },
          { value: '9:16', label: '9:16' },
          { value: '1:1', label: '1:1' },
          { value: '16:9', label: '16:9' }
        ]}
        subtitleOptions={[
          { value: 'all', label: t('subtitlesAll') },
          { value: 'yes', label: t('subtitlesYes') },
          { value: 'no', label: t('subtitlesNo') }
        ]}
        sortOptions={[
          { value: 'newest', label: t('sortNewest') },
          { value: 'oldest', label: t('sortOldest') },
          { value: 'score', label: t('sortScore') },
          { value: 'duration', label: t('sortDuration') }
        ]}
      />

      {clips.length > 0 ? (
        <>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <p aria-live="polite">
              {t('showingResults', {
                first: firstResult,
                last: lastResult,
                total
              })}
            </p>
            {filtersActive && (
              <Link
                href="/dashboard/clips"
                className="font-semibold text-primary hover:underline"
              >
                {t('clearFilters')}
              </Link>
            )}
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {clips.map((clip, index) => (
              <ClipCard
                key={clip.id}
                index={index}
                locale={locale}
                labels={{
                  open: t('openClip'),
                  score: t('viralScoreLabel'),
                  subtitles: t('hasSubtitles')
                }}
                clip={clip}
              />
            ))}
          </div>
          <ClipsPagination
            query={{ ...query, page: currentPage }}
            currentPage={currentPage}
            totalPages={totalPages}
            labels={{
              previous: t('previousPage'),
              next: t('nextPage'),
              page: t('paginationLabel')
            }}
          />
        </>
      ) : (
        <div className="mt-10">
          {filtersActive ? (
            <EmptyState
              icon={SearchX}
              title={t('noMatches')}
              description={t('noMatchesDesc')}
              action={
                <Button asChild={true} variant="outline">
                  <Link
                    href={clipsLibraryHref(query, {
                      search: '',
                      score: 'all',
                      aspect: 'all',
                      subtitles: 'all',
                      sort: 'newest',
                      page: 1
                    })}
                    className=""
                  >
                    {t('clearFilters')}
                  </Link>
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={Film}
              title={t('noClips')}
              description={t('noClipsDesc')}
              action={
                <Button asChild={true} variant="default">
                  <Link href="/dashboard/create" className="">
                    {t('firstProject')}
                  </Link>
                </Button>
              }
            />
          )}
        </div>
      )}
    </div>
  )
}
