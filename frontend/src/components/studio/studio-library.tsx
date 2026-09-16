'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { LoadingIndicator } from '@/components/ui/loading-indicator'
import { useApiResource } from '@/hooks/use-api-resource'
import { Link } from '@/i18n/navigation'
import type { ClipLibraryData } from '@/types/api'
import {
  ChevronLeft,
  ChevronRight,
  Film,
  Plus,
  RefreshCw,
  Search
} from 'lucide-react'
import { useState } from 'react'
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
  onOpen(clipId?: string): void
}) {
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const { data, error, reload } = useApiResource<ClipLibraryData>(
    `/api/clips/library?page=${page}&search=${encodeURIComponent(query)}`
  )
  return (
    <aside
      aria-label="Clips and projects"
      className="flex max-h-[42vh] w-full shrink-0 flex-col border-b bg-card lg:max-h-none lg:w-72 lg:border-b-0 lg:border-r"
    >
      <div className="space-y-3 border-b p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Your clips</h2>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Refresh clips"
            onClick={reload}
          >
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
            placeholder="Find a generated clip"
            aria-label="Search generated clips"
            className="pr-9"
          />
          <button
            type="submit"
            className="absolute right-3 top-3"
            aria-label="Search"
          >
            <Search className="size-4" />
          </button>
        </form>
        <p className="text-xs text-muted-foreground">
          Choose a clip to edit a copy. Your original stays in your library.
        </p>
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
        {error ? (
          <div role="alert" className="space-y-2 text-sm">
            <p>{error}</p>
            <Button variant="outline" onClick={reload}>
              Retry clips
            </Button>
          </div>
        ) : !data ? (
          <p role="status" className="p-3 text-sm text-muted-foreground">
            Loading your clips…
          </p>
        ) : (
          <>
            <p className="px-1 text-xs text-muted-foreground">
              {data.total} generated clips
            </p>
            {data.clips.map((clip) => (
              <button
                key={clip.id}
                type="button"
                disabled={busy !== null}
                onClick={() => onOpen(clip.id)}
                className="flex w-full items-center gap-3 rounded-lg border bg-background p-2 text-left hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                aria-label={`Edit in Studio: ${clip.title}`}
              >
                <div className="relative flex h-14 w-20 shrink-0 items-center justify-center overflow-hidden rounded bg-muted">
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
                  {busy === clip.id && (
                    <LoadingIndicator className="absolute size-5" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="line-clamp-2 text-xs font-medium">
                    {clip.title}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {Math.round(clip.duration)}s · {clip.aspectRatio}
                  </p>
                </div>
              </button>
            ))}
            {!data.clips.length && (
              <div className="space-y-2 p-3 text-sm">
                <p>
                  {query
                    ? 'No clips match this search.'
                    : 'Your generated clips will appear here.'}
                </p>
                <Link
                  className="text-primary underline"
                  href="/dashboard/create"
                >
                  Generate clips
                </Link>
              </div>
            )}
            {data.totalPages > 1 && (
              <div className="flex items-center justify-between">
                <Button
                  size="icon"
                  variant="outline"
                  aria-label="Previous clips"
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
                  aria-label="Next clips"
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
            <h2 className="text-sm font-semibold">Studio projects</h2>
            <Button
              variant="ghost"
              size="icon"
              aria-label="New project"
              disabled={busy !== null}
              onClick={() => onOpen()}
            >
              <Plus className="size-4" />
            </Button>
          </div>
          {projects.map((project) => (
            <button
              key={project.id}
              type="button"
              onClick={() => onSelect(project)}
              aria-current={project.id === activeId ? 'true' : undefined}
              className="block w-full truncate rounded-md px-2 py-2 text-left text-xs hover:bg-muted aria-[current=true]:bg-primary/10 aria-[current=true]:text-primary"
            >
              {project.title}
            </button>
          ))}
        </div>
      </div>
    </aside>
  )
}
