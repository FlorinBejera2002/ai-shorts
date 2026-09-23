'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { LoadingIndicator } from '@/components/ui/loading-indicator'
import { useApiResource } from '@/hooks/use-api-resource'
import { Link } from '@/i18n/navigation'
import type { ClipLibraryData } from '@/types/api'
import { ChevronLeft, ChevronRight, Film, Plus, RefreshCw, Search } from 'lucide-react'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import type { StudioProject } from './studio-client'

export function StudioLibrary({
  projects,
  activeId,
  busy,
  onSelect,
  onOpen
}: {
  projects: StudioProject[]
  activeId: string
  busy: string | null
  onSelect(project: StudioProject): void
  onOpen(clipId?: string, title?: string): void
}) {
  const t = useTranslations('studioWorkspace')
  const [newProject, setNewProject] = useState(false)
  const [title, setTitle] = useState('')
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const { data, error, reload } = useApiResource<ClipLibraryData>(
    `/api/clips/library?page=${page}&search=${encodeURIComponent(query)}`
  )
  return (
    <aside
      id="studio-library"
      aria-label={t('library')}
      className="flex max-h-[42vh] w-full shrink-0 flex-col border-b bg-card lg:max-h-none lg:w-72 lg:border-b-0 lg:border-r"
    >
      <div className="space-y-3 border-b p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">{t('yourClips')}</h2>
          <Button variant="ghost" size="icon" aria-label={t('refreshClips')} onClick={reload}>
            <RefreshCw className="size-4" />
          </Button>
        </div>
        <form
          className="relative"
          onSubmit={(event) => {
            event.preventDefault()
            setPage(1)
            setQuery(search.trim())
          }}
        >
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('findClip')}
            aria-label={t('findClip')}
            className="pr-9"
          />
          <button type="submit" className="absolute right-3 top-3" aria-label={t('search')}>
            <Search className="size-4" />
          </button>
        </form>
        <p className="text-xs text-muted-foreground">{t('copyHint')}</p>
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
        {error ? (
          <div role="alert" className="space-y-2 text-sm">
            <p>{error}</p>
            <Button variant="outline" onClick={reload}>
              {t('retry')}
            </Button>
          </div>
        ) : !data ? (
          <p role="status" className="p-3 text-sm text-muted-foreground">
            {t('loadingClips')}
          </p>
        ) : (
          <>
            <p className="px-1 text-xs text-muted-foreground">
              {t('clipCount', { count: data.total })}
            </p>
            {data.clips.map((clip) => (
              <button
                key={clip.id}
                type="button"
                disabled={busy !== null}
                onClick={() => onOpen(clip.id)}
                className="flex w-full items-center gap-3 rounded-md border bg-background p-2 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                aria-label={t('editClip', { title: clip.title })}
              >
                <div className="relative flex h-14 w-20 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-muted">
                  {clip.thumbnailUrl ? (
                    <img
                      src={clip.thumbnailUrl}
                      alt=""
                      loading="lazy"
                      className="size-full object-cover"
                    />
                  ) : (
                    <Film className="size-5 text-muted-foreground" />
                  )}
                  {busy === clip.id && <LoadingIndicator className="absolute size-5" />}
                </div>
                <div className="min-w-0">
                  <p className="line-clamp-2 text-xs font-medium">{clip.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {Math.round(clip.duration)}s · {clip.aspectRatio}
                  </p>
                </div>
              </button>
            ))}
            {!data.clips.length && (
              <div className="space-y-2 p-3 text-sm">
                <p>{query ? t('noClips') : t('emptyClips')}</p>
                <Link className="text-primary underline" href="/dashboard/create">
                  {t('generateClips')}
                </Link>
              </div>
            )}
            {data.totalPages > 1 && (
              <div className="flex items-center justify-between">
                <Button
                  size="icon"
                  variant="outline"
                  aria-label={t('previous')}
                  disabled={data.currentPage <= 1}
                  onClick={() => setPage(data.currentPage - 1)}
                >
                  <ChevronLeft className="size-4" />
                </Button>
                <span className="text-xs">
                  {data.currentPage} / {data.totalPages}
                </span>
                <Button
                  size="icon"
                  variant="outline"
                  aria-label={t('next')}
                  disabled={data.currentPage >= data.totalPages}
                  onClick={() => setPage(data.currentPage + 1)}
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            )}
          </>
        )}
        <div className="space-y-2 border-t pt-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">{t('projects')}</h2>
            <Button
              variant="ghost"
              size="icon"
              aria-label={t('newProject')}
              aria-expanded={newProject}
              disabled={busy !== null}
              onClick={() => setNewProject((value) => !value)}
            >
              <Plus className="size-4" />
            </Button>
          </div>
          {newProject && (
            <form
              className="space-y-2 rounded-md border p-3"
              onSubmit={(event) => {
                event.preventDefault()
                if (title.trim() && !busy) onOpen(undefined, title.trim())
              }}
            >
              <label htmlFor="studio-project-title" className="text-xs font-medium">
                {t('projectTitle')}
              </label>
              <Input
                id="studio-project-title"
                value={title}
                maxLength={120}
                required
                disabled={busy !== null}
                onChange={(event) => setTitle(event.target.value)}
              />
              <Button
                type="submit"
                size="sm"
                className="w-full"
                disabled={!title.trim() || busy !== null}
              >
                {busy === 'new' && <LoadingIndicator className="size-4" />}
                {t('createProject')}
              </Button>
            </form>
          )}
          {projects.map((project) => (
            <button
              key={project.id}
              type="button"
              disabled={busy !== null}
              onClick={() => onSelect(project)}
              aria-current={project.id === activeId ? 'true' : undefined}
              className="block w-full truncate rounded-sm px-2 py-2 text-left text-xs hover:bg-muted aria-[current=true]:bg-foreground aria-[current=true]:text-background disabled:opacity-50"
            >
              {project.title}
            </button>
          ))}
        </div>
      </div>
    </aside>
  )
}
