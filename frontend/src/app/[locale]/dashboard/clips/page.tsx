import { Button } from '@/components/ui/button'
import { Prisma } from '@prisma/client'
import { Film, SearchX } from 'lucide-react'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { redirect } from 'next/navigation'

import { ClipCard } from '@/components/clips/clip-card'
import { ClipsLibraryToolbar } from '@/components/clips/clips-library-toolbar'
import { ClipsPagination } from '@/components/clips/clips-pagination'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { Link } from '@/i18n/navigation'
import { auth } from '@/lib/auth'
import {
  CLIPS_PAGE_SIZE,
  clipsLibraryHref,
  hasActiveClipFilters,
  parseClipsLibraryQuery
} from '@/lib/clips-library'
import { getPrisma } from '@/lib/db'
import { resolveMediaUrl } from '@/lib/signed-url'

export const runtime = 'nodejs'

type PageSearchParams = Record<string, string | string[] | undefined>

export default async function ClipsPage({
  params,
  searchParams
}: {
  params: Promise<{ locale: string }>
  searchParams: Promise<PageSearchParams>
}) {
  const [{ locale }, rawSearchParams] = await Promise.all([
    params,
    searchParams
  ])
  setRequestLocale(locale)
  const t = await getTranslations('clips')

  const session = await auth()
  if (!session?.user?.id) redirect(`/${locale}/login`)
  const prisma = getPrisma()

  const query = parseClipsLibraryQuery(rawSearchParams)
  const where: Prisma.ClipWhereInput = { userId: session.user.id }
  const and: Prisma.ClipWhereInput[] = []

  if (query.search) {
    and.push({
      OR: [
        { title: { contains: query.search, mode: 'insensitive' } },
        { hookText: { contains: query.search, mode: 'insensitive' } }
      ]
    })
  }
  if (query.score === 'high') and.push({ viralScore: { gte: 8 } })
  if (query.score === 'promising') {
    and.push({ viralScore: { gte: 5, lt: 8 } })
  }
  if (query.score === 'low') and.push({ viralScore: { lt: 5 } })
  if (query.aspect !== 'all') and.push({ aspectRatio: query.aspect })
  if (query.subtitles !== 'all') {
    and.push({ hasSubtitles: query.subtitles === 'yes' })
  }
  if (and.length > 0) where.AND = and

  const orderBy: Prisma.ClipOrderByWithRelationInput[] =
    query.sort === 'oldest'
      ? [{ createdAt: 'asc' }, { id: 'asc' }]
      : query.sort === 'score'
        ? [{ viralScore: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }]
        : query.sort === 'duration'
          ? [{ duration: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }]
          : [{ createdAt: 'desc' }, { id: 'desc' }]

  const total = await prisma.clip.count({ where })
  const totalPages = Math.max(1, Math.ceil(total / CLIPS_PAGE_SIZE))
  const currentPage = Math.min(query.page, totalPages)
  const clips = await prisma.clip.findMany({
    where,
    orderBy,
    skip: (currentPage - 1) * CLIPS_PAGE_SIZE,
    take: CLIPS_PAGE_SIZE,
    select: {
      id: true,
      title: true,
      hookText: true,
      duration: true,
      viralScore: true,
      resolution: true,
      aspectRatio: true,
      hasSubtitles: true,
      thumbnailPath: true,
      thumbnailUrl: true,
      thumbnailStorageKey: true,
      createdAt: true
    }
  })

  const firstResult = total === 0 ? 0 : (currentPage - 1) * CLIPS_PAGE_SIZE + 1
  const lastResult = Math.min(total, currentPage * CLIPS_PAGE_SIZE)
  const filtersActive = hasActiveClipFilters(query)

  return (
    <div className="animate-fade-in">
      <PageHeader
        title={t('title')}
        description={t('count', { count: total })}
        actions={
          <Button asChild={true} variant="default">
            <Link href="/dashboard/create" className="">
              {t('createClip')}
            </Link>
          </Button>
        }
      />

      <ClipsLibraryToolbar
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
                clip={{
                  ...clip,
                  thumbnailUrl: resolveMediaUrl(
                    clip.thumbnailStorageKey ?? clip.thumbnailPath,
                    clip.thumbnailUrl
                  ),
                  createdAt: clip.createdAt.toISOString()
                }}
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
