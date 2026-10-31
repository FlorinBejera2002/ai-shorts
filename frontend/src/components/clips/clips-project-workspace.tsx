'use client'

import { useRouter } from '@/i18n/navigation'
import {
  CLIPS_PAGE_SIZE,
  clipsLibraryHref,
  hasActiveClipFilters,
  parseClipsLibraryQuery
} from '@/lib/clips-library'
import { useLocale } from 'next-intl'
import { useSearchParams } from 'next/navigation'
import { ClipLibraryCard } from './clip-library-card'
import { useClipsCopy } from './clips-copy'
import { ClipsLibraryToolbar } from './clips-library-toolbar'
import { ClipsMobileProjects } from './clips-mobile-projects'
import { ClipsPagination } from './clips-pagination'
import { ClipsProjectRail } from './clips-project-rail'
import type { ClipsWorkspaceProps } from './clips-project-types'
import {
  ClipsEmptyLibrary,
  ClipsEmptyProject,
  ClipsNoResults
} from './clips-states'
import styles from './clips-workspace.module.css'
import { useClipsFilters } from './use-clips-filters'

export function ClipsProjectWorkspace(props: ClipsWorkspaceProps) {
  const { projects, project, folderId, onProject, onFolder, onMoveClip, onDeleted } =
    props
  const locale = useLocale()
  const copy = useClipsCopy()
  const searchParams = useSearchParams()
  const router = useRouter()
  const { clearFilters } = useClipsFilters()
  const query = parseClipsLibraryQuery(Object.fromEntries(searchParams))
  const sourceClips = (project ? [project] : projects).flatMap((owner) =>
    owner.clips.map((clip) => ({ ...clip, owner }))
  )
  const search = query.search.toLocaleLowerCase(locale)
  const matching = sourceClips
    .filter((clip) => {
      if (folderId === 'unassigned' && clip.folderId !== null) return false
      if (project && folderId !== 'all' && clip.folderId !== folderId)
        return false
      if (
        search &&
        !`${clip.title} ${clip.hookText ?? ''}`
          .toLocaleLowerCase(locale)
          .includes(search)
      )
        return false
      const score = clip.viralScore ?? 0
      if (query.score === 'high' && score < 8) return false
      if (query.score === 'promising' && (score < 5 || score >= 8)) return false
      if (query.score === 'low' && score >= 5) return false
      if (query.aspect !== 'all' && clip.aspectRatio !== query.aspect)
        return false
      if (query.subtitles === 'yes' && !clip.hasSubtitles) return false
      if (query.subtitles === 'no' && clip.hasSubtitles) return false
      return true
    })
    .sort((left, right) => {
      if (query.sort === 'oldest')
        return Date.parse(left.createdAt) - Date.parse(right.createdAt)
      if (query.sort === 'score')
        return (right.viralScore ?? 0) - (left.viralScore ?? 0)
      if (query.sort === 'duration') return right.duration - left.duration
      return Date.parse(right.createdAt) - Date.parse(left.createdAt)
    })
  const total = matching.length
  const totalPages = Math.max(1, Math.ceil(total / CLIPS_PAGE_SIZE))
  const currentPage = Math.min(query.page, totalPages)
  const first = (currentPage - 1) * CLIPS_PAGE_SIZE
  const clips = matching.slice(first, first + CLIPS_PAGE_SIZE)
  const libraryEmpty = projects.every((owner) => owner.clips.length === 0)
  const inProject = folderId === 'unassigned' || (project && folderId !== 'all')

  function selectFolder(ownerId: string, nextFolder: string) {
    onProject(ownerId)
    onFolder(nextFolder)
    if (query.page !== 1)
      router.replace(clipsLibraryHref(query, { page: 1 }), { scroll: false })
  }

  const navigation = { ...props, onSelect: selectFolder }

  return (
    <div className={styles.browser}>
      <ClipsMobileProjects {...navigation} />
      <div className={styles.layout}>
        <ClipsProjectRail {...navigation} />
        <section className={styles.content} aria-label={copy.title}>
          <ClipsLibraryToolbar query={query} />
          {clips.length ? (
            <div className={styles.grid} data-clips-grid="">
              {clips.map((clip) => (
                <div
                  key={clip.id}
                  className={styles.card}
                  draggable={true}
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = 'move'
                    event.dataTransfer.setData(
                      'application/x-sneepcut-clip',
                      clip.id
                    )
                    event.dataTransfer.setData(
                      `application/x-sneepcut-project-${clip.owner.id}`,
                      clip.owner.id
                    )
                    event.currentTarget.dataset.dragging = 'true'
                  }}
                  onDragEnd={(event) => {
                    delete event.currentTarget.dataset.dragging
                  }}
                >
                  <ClipLibraryCard
                    locale={locale}
                    clip={{ ...clip, viralScore: clip.viralScore ?? 0 }}
                    moveTargets={[
                      { value: 'root', label: copy.unassigned },
                      ...clip.owner.folders.map((folder) => ({
                        value: folder.id,
                        label: folder.name
                      }))
                    ]}
                    currentMoveTarget={clip.folderId ?? 'root'}
                    onMove={async (value) => {
                      const success = await onMoveClip(
                        clip.owner.id,
                        clip.id,
                        value === 'root' ? null : value
                      )
                      if (!success) throw new Error(copy.failed)
                    }}
                    onDeleted={onDeleted}
                  />
                </div>
              ))}
            </div>
          ) : hasActiveClipFilters(query) ? (
            <ClipsNoResults onClear={clearFilters} />
          ) : inProject ? (
            <ClipsEmptyProject />
          ) : libraryEmpty ? (
            <ClipsEmptyLibrary />
          ) : (
            <ClipsEmptyProject />
          )}
          {total > 0 && (
            <ClipsPagination
              query={{ ...query, page: currentPage }}
              currentPage={currentPage}
              totalPages={totalPages}
              summary={copy.range(first + 1, Math.min(total, first + CLIPS_PAGE_SIZE), total)}
              labels={{
                previous: copy.previous,
                next: copy.next,
                page: copy.pages
              }}
            />
          )}
        </section>
      </div>
    </div>
  )
}
