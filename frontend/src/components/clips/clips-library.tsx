'use client'

import theme from '@/components/calendar/publishing-theme.module.css'
import { WorkspaceMobileHeader } from '@/components/dashboard/workspace-mobile-header'
import { useIsMobile } from '@/hooks/use-mobile'
import type { ClipsLibrary, LibraryClip } from '@/lib/clips-library'
import { useState } from 'react'
import { ClipActionsSheet } from './clip-actions'
import { ClipsBrowser, type BrowserProps } from './clips-browser'
import { DeleteClipDialog, DeleteProjectDialog, ProjectNameDialog } from './clips-dialogs'
import { ClipDragGhost } from './clips-feedback'
import { ProjectActionsSheet } from './clips-projects'
import { ClipsEmptyLibrary, ClipsLoadError, ClipsLoadingGrid, ClipsRailSkeleton } from './clips-states'
import { ClipsMobileToolbar, ClipsToolbar } from './clips-toolbar'
import styles from './clips.module.css'
import { useClipDrag } from './use-clip-drag'
import { useClipsCommands } from './use-clips-commands'
import { useClipsLibrary } from './use-clips-library'
import { useClipsQuery } from './use-clips-query'

/** Clipuri: every clip, organised in projects; filters, pages, menus, drag & drop and dialogs. */
export function ClipsLibraryPage() {
  const mobile = useIsMobile()
  const { library, isPending, isError, reload, actions } = useClipsLibrary()
  const { query, update, clearFilters, href } = useClipsQuery()
  const commands = useClipsCommands({
    library,
    actions,
    onProjectDeleted: (id) => query.project === id && update({ project: 'all' })
  })
  const { drag, ghostRef, start } = useClipDrag((clip, projectId) => void commands.move(clip, projectId))
  const [sheetClip, setSheetClip] = useState<LibraryClip | null>(null)
  const [sheetProjectId, setSheetProjectId] = useState<string | null>(null)
  const targetName = drag?.targetId ? (library?.collections.find((project) => project.id === drag.targetId)?.name ?? null) : null

  const browser: Omit<BrowserProps, 'library'> = {
    query,
    mobile,
    update,
    href,
    clearFilters,
    commands: commands.clipCommands,
    dropTarget: drag ? drag.targetId : undefined,
    draggingId: drag?.clip.id ?? null,
    projectCommands: commands.projectCommands,
    onPointerDown: start,
    onOpenSheet: setSheetClip,
    onProjectMenu: setSheetProjectId
  }

  return (
    <div className={`${theme.surface} ${styles.tokens} ${styles.page}`} data-reference-surface="" data-clips-workspace="">
      <WorkspaceMobileHeader />
      <ClipsBody library={library} isPending={isPending} isError={isError} reload={reload} browser={browser} />
      {drag && <ClipDragGhost clip={drag.clip} targetName={targetName} ghostRef={ghostRef} />}
      <ClipActionsSheet clip={mobile ? sheetClip : null} commands={commands.clipCommands} onClose={() => setSheetClip(null)} />
      <ProjectActionsSheet
        project={(mobile && library?.collections.find((project) => project.id === sheetProjectId)) || null}
        commands={commands.projectCommands}
        onClose={() => setSheetProjectId(null)}
      />
      <ClipsDialogs mobile={mobile} dialogs={commands.dialogs} />
    </div>
  )
}

/** Error, loading, the empty library or the loaded browser. */
function ClipsBody({
  library,
  isPending,
  isError,
  reload,
  browser
}: {
  library: ClipsLibrary | null
  isPending: boolean
  isError: boolean
  reload: () => void
  browser: Omit<BrowserProps, 'library'>
}) {
  const { mobile, query, update } = browser
  if (isError) return <ClipsLoadError mobile={mobile} onRetry={reload} />
  if (isPending || !library)
    return mobile ? (
      <>
        <ClipsMobileToolbar query={query} onChange={update} />
        <ClipsLoadingGrid mobile />
      </>
    ) : (
      <div className={styles.layout}>
        <ClipsRailSkeleton />
        <div className={styles.content}>
          <ClipsToolbar query={query} onChange={update} />
          <ClipsLoadingGrid mobile={false} />
        </div>
      </div>
    )
  if (!library.clips.length && !library.collections.length) return <ClipsEmptyLibrary mobile={mobile} />
  return <ClipsBrowser library={library} {...browser} />
}

/** Project name, delete clip and delete project confirmations. */
function ClipsDialogs({ mobile, dialogs }: { mobile: boolean; dialogs: ReturnType<typeof useClipsCommands>['dialogs'] }) {
  return (
    <>
      <ProjectNameDialog
        initialName={dialogs.naming ? (dialogs.naming.project?.name ?? '') : null}
        renaming={Boolean(dialogs.naming?.project)}
        error={dialogs.nameError}
        mobile={mobile}
        busy={dialogs.busy}
        onClose={dialogs.closeNaming}
        onSubmit={(name) => void dialogs.submitName(name)}
      />
      <DeleteClipDialog
        title={dialogs.deletingClip?.title ?? null}
        mobile={mobile}
        busy={dialogs.busy}
        onClose={dialogs.closeDeleteClip}
        onConfirm={() => void dialogs.confirmDeleteClip()}
      />
      <DeleteProjectDialog
        name={dialogs.deletingProject?.name ?? null}
        mobile={mobile}
        busy={dialogs.busy}
        onClose={dialogs.closeDeleteProject}
        onConfirm={() => void dialogs.confirmDeleteProject()}
      />
    </>
  )
}
