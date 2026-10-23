'use client'

import { Button } from '@/components/ui/button'
import { useRouter } from '@/i18n/navigation'
import {
  CLIPS_PAGE_SIZE,
  clipsLibraryHref,
  hasActiveClipFilters,
  parseClipsLibraryQuery
} from '@/lib/clips-library'
import { FolderOpen } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useSearchParams } from 'next/navigation'
import { ClipCard } from './clip-card'
import { ClipsLibraryToolbar } from './clips-library-toolbar'
import { ClipsPagination } from './clips-pagination'
import { ClipsProjectRail } from './clips-project-rail'
import type { ClipsWorkspaceProps } from './clips-project-types'
import styles from './clips-workspace.module.css'

export function ClipsProjectWorkspace(props: ClipsWorkspaceProps) {
  const {
    projects,
    project,
    folderId,
    text,
    onProject,
    onFolder,
    onMoveClip,
    onDeleted
  } = props
  const locale = useLocale()
  const t = useTranslations('clips')
  const studio = useTranslations('studioEditor')
  const searchParams = useSearchParams()
  const router = useRouter()
  const query = parseClipsLibraryQuery(Object.fromEntries(searchParams))
  const folders = projects.flatMap((owner) =>
    owner.folders.map((folder) => ({ owner, folder }))
  )
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
  const clips = matching.slice(
    (currentPage - 1) * CLIPS_PAGE_SIZE,
    currentPage * CLIPS_PAGE_SIZE
  )
  const filtersActive = hasActiveClipFilters(query)
  const organization =
    folderId === 'unassigned'
      ? 'unassigned'
      : project && folderId !== 'all'
        ? `${project.id}:${folderId}`
        : 'all'

  function selectFolder(ownerId: string, nextFolder: string, resetPage = true) {
    onProject(ownerId)
    onFolder(nextFolder)
    if (resetPage && query.page !== 1)
      router.replace(clipsLibraryHref(query, { page: 1 }), { scroll: false })
  }

  return (
    <section className={styles.browser} aria-label={text.allProjects}>
      <ClipsLibraryToolbar
        query={query}
        organizationFilter={{
          label: text.organization,
          value: organization,
          mobileOnly: true,
          options: [
            { value: 'all', label: text.allProjects },
            { value: 'unassigned', label: text.unassignedClips },
            ...folders.map(({ owner, folder }) => ({
              value: `${owner.id}:${folder.id}`,
              label: folder.name
            })),
            { value: 'create', label: text.createFolder }
          ],
          onChange: (value) => {
            if (value === 'create') return props.onCreateFolder()
            const separator = value.indexOf(':')
            if (separator >= 0)
              selectFolder(
                value.slice(0, separator),
                value.slice(separator + 1),
                false
              )
            else
              selectFolder(
                '',
                value === 'unassigned' ? 'unassigned' : 'all',
                false
              )
          }
        }}
        labels={{
          search: t('searchLabel'),
          searchPlaceholder: t('searchPlaceholder'),
          filters: t('filtersLabel'),
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
      <div className={styles.layout}>
        <ClipsProjectRail {...props} onSelect={selectFolder} />
        {clips.length ? (
          <div className={styles.grid} data-clips-grid="">
            {clips.map((clip, index) => (
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
                <ClipCard
                  index={index}
                  locale={locale}
                  clip={{ ...clip, viralScore: clip.viralScore ?? 0 }}
                  labels={{
                    open: studio('edit'),
                    score: t('viralScoreLabel'),
                    subtitles: t('hasSubtitles')
                  }}
                  actions={{
                    edit: studio('edit'),
                    publish: t('publishClip'),
                    download: t('downloadClip'),
                    delete: t('deleteClip'),
                    deleteConfirm: t('deleteConfirm'),
                    deleteSuccess: t('deleteSuccess'),
                    deleteError: t('deleteError')
                  }}
                  menuLabel={t('actionsLabel', { title: clip.title })}
                  cancelLabel={text.cancel}
                  moveLabel={t('moveToProject')}
                  moveTargets={[
                    { value: 'root', label: text.root },
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
                    if (!success) throw new Error(text.failed)
                  }}
                  onDeleted={onDeleted}
                />
              </div>
            ))}
          </div>
        ) : (
          <div className={styles.empty}>
            <FolderOpen aria-hidden="true" />
            <h2>{filtersActive ? t('noMatches') : text.emptyFolder}</h2>
            <p>{filtersActive ? t('noMatchesDesc') : text.emptyHint}</p>
            {filtersActive && (
              <Button
                variant="outline"
                onClick={() =>
                  router.replace('/dashboard/clips', { scroll: false })
                }
              >
                {t('clearFilters')}
              </Button>
            )}
          </div>
        )}
      </div>
      <footer className={styles.footer}>
        <p aria-live="polite">
          {t('showingResults', {
            first: total ? (currentPage - 1) * CLIPS_PAGE_SIZE + 1 : 0,
            last: Math.min(total, currentPage * CLIPS_PAGE_SIZE),
            total
          })}
        </p>
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
      </footer>
    </section>
  )
}
