'use client'

import {
  CLIPS_MOBILE_BATCH,
  clipsHref,
  hasClipsRefinement,
  isClipsListScope,
  paginateClips,
  selectClips,
  type ClipsLibrary,
  type ClipsQuery,
  type LibraryClip
} from '@/lib/clips-library'
import { useLocale, useTranslations } from 'next-intl'
import { useState } from 'react'
import type { ClipCommands } from './clip-actions'
import { ClipTile } from './clip-tile'
import { ClipsLoadMore, ClipsPager } from './clips-pager'
import { ClipsChips, ClipsProjectHead, ClipsRail, type ProjectCommands } from './clips-projects'
import { ClipsEmptyFavorites, ClipsEmptyLibrary, ClipsEmptyProject, ClipsNoResults } from './clips-states'
import { ClipsActiveFilters, ClipsMobileSort, ClipsMobileToolbar, ClipsToolbar } from './clips-toolbar'
import styles from './clips.module.css'

export type BrowserProps = {
  library: ClipsLibrary
  query: ClipsQuery
  mobile: boolean
  update: (changes: Partial<ClipsQuery>) => void
  href: (changes: Partial<ClipsQuery>) => string
  clearFilters: () => void
  commands: ClipCommands
  dropTarget: string | null | undefined
  draggingId: string | null
  projectCommands: ProjectCommands
  onPointerDown: Parameters<typeof ClipTile>[0]['onPointerDown']
  onOpenSheet: (clip: LibraryClip) => void
  onProjectMenu: (projectId: string) => void
}

/** A project id that no longer exists falls back to "all clips". */
function scopeOf(query: ClipsQuery, library: ClipsLibrary) {
  if (isClipsListScope(query.project)) return query.project
  return library.collections.some((project) => project.id === query.project) ? query.project : 'all'
}

/** Which clips the current scope, filters and page (or phone batch) show. */
function useClipsSelection(library: ClipsLibrary, query: ClipsQuery, mobile: boolean) {
  const locale = useLocale()
  const scope = scopeOf(query, library)
  const scoped = { ...query, project: scope }
  const matching = selectClips(library.clips, scoped, locale)
  // Phones show batches of six; a new scope or filter starts again from the first batch.
  const listKey = clipsHref(scoped, { page: 1 })
  const [batch, setBatch] = useState({ key: listKey, shown: CLIPS_MOBILE_BATCH })
  if (batch.key !== listKey) setBatch({ key: listKey, shown: CLIPS_MOBILE_BATCH })
  const page = paginateClips(matching, query.page)
  return {
    scope,
    project: library.collections.find((item) => item.id === scope) ?? null,
    matching,
    page,
    visible: mobile ? matching.slice(0, batch.shown) : page.items,
    showMore: () => setBatch({ key: listKey, shown: batch.shown + CLIPS_MOBILE_BATCH })
  }
}

/** The loaded library: project navigation, toolbar, grid and paging for desktop or phone. */
export function ClipsBrowser(props: BrowserProps) {
  const { library, query, mobile, update, href, dropTarget } = props
  const selection = useClipsSelection(library, query, mobile)
  const { scope, project } = selection
  const head = project && <ClipsProjectHead project={project} mobile={mobile} onMenu={() => props.onProjectMenu(project.id)} />
  const results = <ClipsResults {...props} selection={selection} />

  if (mobile)
    return (
      <div className={styles.content}>
        <ClipsMobileToolbar query={query} onChange={update} />
        <ClipsChips library={library} scope={scope} href={href} dropTarget={dropTarget} commands={props.projectCommands} />
        {head}
        <ClipsActiveFilters query={query} onChange={update} mobile />
        {results}
      </div>
    )
  // An empty project shows only its drop area, without the toolbar.
  const emptyProject = Boolean(project) && !selection.matching.length && !hasClipsRefinement(query)
  return (
    <div className={styles.layout}>
      <ClipsRail library={library} scope={scope} href={href} dropTarget={dropTarget} commands={props.projectCommands} />
      <div className={styles.content}>
        {head}
        {!emptyProject && (
          <>
            <ClipsToolbar query={query} onChange={update} />
            <ClipsActiveFilters query={query} onChange={update} mobile={false} />
          </>
        )}
        {results}
      </div>
    </div>
  )
}

/** Grid with paging, or the right empty state for the scope and filters. */
function ClipsResults({ selection, ...props }: BrowserProps & { selection: ReturnType<typeof useClipsSelection> }) {
  const t = useTranslations('clipsLibrary')
  const { mobile, query } = props
  const { matching, visible, project, scope } = selection
  if (!matching.length) {
    if (hasClipsRefinement(query)) return <ClipsNoResults mobile={mobile} onClear={props.clearFilters} />
    if (scope === 'all') return <ClipsEmptyLibrary mobile={mobile} />
    if (scope === 'favorites') return <ClipsEmptyFavorites mobile={mobile} />
    return <ClipsEmptyProject mobile={mobile} unassigned={scope === 'none'} />
  }
  const names = new Map(props.library.collections.map((item) => [item.id, item.name]))
  return (
    <>
      {mobile && !project && (
        <div className={styles.listHead}>
          <span className={styles.muted}>{t(scope === 'favorites' ? 'favoriteCount' : 'clipCount', { count: matching.length })}</span>
          <ClipsMobileSort query={query} onChange={props.update} />
        </div>
      )}
      <div className={styles.grid} data-clips-grid="">
        {visible.map((clip) => (
          <ClipTile
            key={clip.id}
            clip={clip}
            projectName={clip.collectionId ? (names.get(clip.collectionId) ?? null) : null}
            commands={props.commands}
            mobile={mobile}
            dragging={props.draggingId === clip.id}
            onPointerDown={props.onPointerDown}
            onOpenSheet={props.onOpenSheet}
          />
        ))}
      </div>
      {mobile ? (
        <ClipsLoadMore shown={visible.length} total={matching.length} onMore={selection.showMore} />
      ) : (
        <ClipsPager {...selection.page} total={matching.length} href={props.href} />
      )}
    </>
  )
}
