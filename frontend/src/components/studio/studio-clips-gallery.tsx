'use client'

import '@/components/clips/media-workbench.css'

import { ClipCard } from '@/components/clips/clip-card'
import { ApiState } from '@/components/shared/api-state'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { PageHeader } from '@/components/ui/page-header'
import { useApiResource } from '@/hooks/use-api-resource'
import { Link } from '@/i18n/navigation'
import type { ClipLibraryData } from '@/types/api'
import { ChevronLeft, ChevronRight, Film, FolderOpen, Plus, Search } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { type FormEvent, useMemo, useState } from 'react'
import styles from './studio-clips-gallery.module.css'

export function StudioClipsGallery() {
  const t = useTranslations('studioEditor')
  const locale = useLocale()
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const path = useMemo(() => {
    const query = new URLSearchParams({
      page: String(page),
      search
    })
    return `/api/clips/library?${query}`
  }, [page, search])
  const { data, error, reload } = useApiResource<ClipLibraryData>(path)

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPage(1)
    setSearch(searchInput.trim())
  }

  return (
    <div className={`${styles.workspace} dashboard-workspace animate-fade-in`}>
      <PageHeader
        title={t('title')}
        description={data ? t('description', { count: data.total }) : undefined}
        actions={
          <>
            <Button asChild={true} variant="outline">
              <Link href="/dashboard/studio?workspace=1">
                <FolderOpen aria-hidden="true" />
                {t('openWorkspace')}
              </Link>
            </Button>
            <Button asChild={true} className="clips-create-action">
              <Link href="/dashboard/create">
                <Plus aria-hidden="true" />
                {t('create')}
              </Link>
            </Button>
          </>
        }
      />

      <section className={styles.library} aria-labelledby="editor-library-title">
        <div className={styles.libraryHeader}>
          <div className={styles.libraryCopy}>
            <p className={styles.eyebrow}>
              {data &&
                (search
                  ? t('filteredCount', { count: data.total, search })
                  : t('description', { count: data.total }))}
            </p>
            <h2 id="editor-library-title">{t('libraryTitle')}</h2>
          </div>
          <form className={styles.search} onSubmit={submitSearch}>
            <Search aria-hidden="true" />
            <Input
              type="search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              maxLength={80}
              placeholder={t('searchPlaceholder')}
              aria-label={t('searchLabel')}
            />
          </form>
        </div>

        {!data ? (
          <ApiState error={error} retry={reload} />
        ) : data.clips.length ? (
          <>
            <div className={styles.grid}>
              {data.clips.map((clip, index) => (
                <ClipCard
                  key={clip.id}
                  clip={clip}
                  index={index}
                  locale={locale}
                  href={`/dashboard/studio?clip=${clip.id}`}
                  actionLabel={t('edit')}
                  labels={{
                    open: t('edit'),
                    score: t('score'),
                    subtitles: t('subtitles')
                  }}
                />
              ))}
            </div>
            <GalleryPagination
              currentPage={data.currentPage}
              totalPages={data.totalPages}
              onPage={setPage}
              labels={{
                previous: t('previous'),
                next: t('next'),
                page: t('page')
              }}
            />
          </>
        ) : (
          <div className={styles.empty}>
            <EmptyState
              icon={Film}
              title={search ? t('noResults') : t('emptyTitle')}
              description={search ? t('noResultsDescription') : t('emptyDescription')}
              action={
                search ? (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSearchInput('')
                      setSearch('')
                      setPage(1)
                    }}
                  >
                    {t('clearSearch')}
                  </Button>
                ) : (
                  <Button asChild={true}>
                    <Link href="/dashboard/create">{t('createFirst')}</Link>
                  </Button>
                )
              }
            />
          </div>
        )}
      </section>
    </div>
  )
}

function GalleryPagination({
  currentPage,
  totalPages,
  onPage,
  labels
}: {
  currentPage: number
  totalPages: number
  onPage(page: number): void
  labels: { previous: string; next: string; page: string }
}) {
  if (totalPages <= 1) return null
  return (
    <nav className={styles.pagination} aria-label={labels.page}>
      <Button variant="outline" disabled={currentPage <= 1} onClick={() => onPage(currentPage - 1)}>
        <ChevronLeft aria-hidden="true" />
        {labels.previous}
      </Button>
      <span>
        {currentPage} / {totalPages}
      </span>
      <Button
        variant="outline"
        disabled={currentPage >= totalPages}
        onClick={() => onPage(currentPage + 1)}
      >
        {labels.next}
        <ChevronRight aria-hidden="true" />
      </Button>
    </nav>
  )
}
