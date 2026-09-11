'use client'

import { ApiState } from '@/components/shared/api-state'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { PageHeader } from '@/components/ui/page-header'
import { useApiResource } from '@/hooks/use-api-resource'
import { Link } from '@/i18n/navigation'
import type { ClipLibraryData, FullClip } from '@/types/api'
import {
  Captions,
  ChevronLeft,
  ChevronRight,
  Film,
  PencilLine,
  Plus,
  Search,
  Sparkles,
  Zap
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import Image from 'next/image'
import { type FormEvent, useMemo, useState } from 'react'
import styles from './studio-clips-gallery.module.css'

export function StudioClipsGallery() {
  const t = useTranslations('studioEditor')
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

  if (!data) return <ApiState error={error} retry={reload} />

  return (
    <div className="dashboard-workspace animate-fade-in">
      <PageHeader
        title={t('title')}
        description={t('description', { count: data.total })}
        actions={
          <Button asChild={true} className="clips-create-action">
            <Link href="/dashboard/create">
              <Plus aria-hidden="true" />
              {t('create')}
            </Link>
          </Button>
        }
      />

      <section
        className={styles.library}
        aria-labelledby="editor-library-title"
      >
        <div className={styles.libraryHeader}>
          <div>
            <p className={styles.eyebrow}>
              <Sparkles aria-hidden="true" />
              {t('eyebrow')}
            </p>
            <h2 id="editor-library-title">{t('libraryTitle')}</h2>
            <p>{t('libraryDescription')}</p>
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
            <Button type="submit" variant="secondary">
              {t('search')}
            </Button>
          </form>
        </div>

        {data.clips.length ? (
          <>
            <div className={styles.resultBar}>
              <p aria-live="polite">
                {search
                  ? t('filteredCount', { count: data.total, search })
                  : t('count', { count: data.total })}
              </p>
              <span>{t('editorHint')}</span>
            </div>
            <div className={styles.grid}>
              {data.clips.map((clip, index) => (
                <EditorClipCard
                  key={clip.id}
                  clip={clip}
                  index={index}
                  labels={{
                    edit: t('edit'),
                    score: t('score'),
                    subtitles: t('subtitles'),
                    ready: t('ready')
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
              description={
                search ? t('noResultsDescription') : t('emptyDescription')
              }
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

function EditorClipCard({
  clip,
  labels,
  index
}: {
  clip: FullClip
  labels: {
    edit: string
    score: string
    subtitles: string
    ready: string
  }
  index: number
}) {
  return (
    <Card
      as="article"
      className={styles.card}
      style={{ animationDelay: `${Math.min(index, 12) * 35}ms` }}
    >
      <div className={styles.preview}>
        {clip.thumbnailUrl ? (
          <Image
            src={clip.thumbnailUrl}
            alt=""
            fill={true}
            sizes="(max-width: 640px) 100vw, (max-width: 1100px) 50vw, 25vw"
            className={styles.thumbnail}
            unoptimized={true}
          />
        ) : (
          <div className={styles.placeholder}>
            <Film aria-hidden="true" />
          </div>
        )}
        <div className={styles.previewShade} aria-hidden="true" />
        <span className={styles.ready}>
          <span aria-hidden="true" />
          {labels.ready}
        </span>
        <span className={styles.duration}>
          {Math.round(clip.duration)}s · {clip.aspectRatio}
        </span>
      </div>

      <div className={styles.cardBody}>
        <div className={styles.titleRow}>
          <h3>{clip.title}</h3>
          {clip.viralScore > 0 && (
            <span className={styles.score} title={labels.score}>
              <Zap aria-hidden="true" />
              {clip.viralScore}/10
            </span>
          )}
        </div>
        <p className={styles.hook}>
          {clip.hookText || clip.scoreReason || '\u00a0'}
        </p>
        <div className={styles.meta}>
          <span>{clip.resolution || '—'}</span>
          {clip.hasSubtitles && (
            <span>
              <Captions aria-hidden="true" />
              {labels.subtitles}
            </span>
          )}
        </div>
        <Button asChild={true} className={styles.editButton}>
          <Link href={`/dashboard/clips/${clip.id}/edit`}>
            <PencilLine aria-hidden="true" />
            {labels.edit}
          </Link>
        </Button>
      </div>
    </Card>
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
      <Button
        variant="outline"
        disabled={currentPage <= 1}
        onClick={() => onPage(currentPage - 1)}
      >
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
