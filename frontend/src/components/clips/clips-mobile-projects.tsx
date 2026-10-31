'use client'

import theme from '@/components/calendar/publishing-theme.module.css'
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger
} from '@/components/ui/sheet'
import { Check, ChevronDown, Folder, MoreHorizontal, Plus } from 'lucide-react'
import { useState } from 'react'
import { useClipsCopy } from './clips-copy'
import styles from './clips-mobile-sheets.module.css'
import {
  type ClipsFolderEntry,
  summarizeClipsProjects
} from './clips-project-summary'
import type { ClipsWorkspaceProps } from './clips-project-types'

type Props = Pick<
  ClipsWorkspaceProps,
  | 'projects'
  | 'project'
  | 'folderId'
  | 'onCreateFolder'
  | 'onRenameFolder'
  | 'onDeleteFolder'
  | 'onBrand'
> & {
  onSelect: (projectId: string, folderId: string) => void
}

/** Phone/tablet project selector with per-project options. */
export function ClipsMobileProjects({
  projects,
  project,
  folderId,
  onSelect,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onBrand
}: Props) {
  const copy = useClipsCopy()
  const [open, setOpen] = useState(false)
  const [options, setOptions] = useState<ClipsFolderEntry | null>(null)
  const { folders, total, unassigned } = summarizeClipsProjects(projects)
  const current = folders.find(
    (entry) => entry.owner.id === project?.id && entry.folder.id === folderId
  )
  const currentName =
    current?.folder.name ??
    (folderId === 'unassigned' ? copy.unassigned : copy.allClips)
  const currentCount =
    current?.count ?? (folderId === 'unassigned' ? unassigned : total)

  function choose(ownerId: string, nextFolder: string) {
    onSelect(ownerId, nextFolder)
    setOpen(false)
  }

  function act(action: () => void) {
    setOptions(null)
    setOpen(false)
    action()
  }

  const rows = [
    { key: 'all', name: copy.allClips, count: total, active: !project && folderId === 'all', select: () => choose('', 'all') },
    ...folders.map((entry) => ({
      key: entry.folder.id,
      name: entry.folder.name,
      count: entry.count,
      active: entry === current,
      select: () => choose(entry.owner.id, entry.folder.id),
      entry
    })),
    { key: 'unassigned', name: copy.unassigned, count: unassigned, active: folderId === 'unassigned', select: () => choose('', 'unassigned') }
  ]

  return (
    <div className={styles.projects}>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild={true}>
          <button
            type="button"
            className={styles.projectButton}
            aria-label={copy.projectButton(currentName)}
            data-clips-project-picker=""
          >
            <Folder aria-hidden="true" />
            <span className={styles.projectName}>{currentName}</span>
            <span className={styles.projectCount}>{currentCount}</span>
            <ChevronDown aria-hidden="true" />
          </button>
        </SheetTrigger>
        <SheetContent
          side="bottom"
          showCloseButton={false}
          aria-describedby={undefined}
          className={`${theme.surface} ${styles.sheet}`}
          overlayClassName={theme.overlay}
          data-reference-surface=""
        >
          <span className={styles.handle} aria-hidden="true" />
          <SheetTitle className={styles.sheetTitle}>{copy.foldersTitle}</SheetTitle>
          <div className={styles.list}>
            {rows.map((row) => (
              <div key={row.key} className={styles.listRow} data-active={row.active}>
                <button
                  type="button"
                  className={styles.listSelect}
                  aria-current={row.active || undefined}
                  data-clips-project={row.key}
                  onClick={row.select}
                >
                  <span className={styles.projectName}>{row.name}</span>
                  <span className={styles.projectCount}>{row.count}</span>
                  {row.active && <Check aria-hidden="true" />}
                </button>
                {'entry' in row && row.entry && (
                  <button
                    type="button"
                    className={styles.more}
                    aria-label={copy.projectOptions(row.name)}
                    onClick={() => setOptions(row.entry)}
                  >
                    <MoreHorizontal aria-hidden="true" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </SheetContent>
      </Sheet>
      <button
        type="button"
        className={styles.newProject}
        aria-label={copy.newProject}
        onClick={onCreateFolder}
      >
        <Plus aria-hidden="true" />
      </button>
      <Sheet
        open={options !== null}
        onOpenChange={(value) => {
          if (!value) setOptions(null)
        }}
      >
        <SheetContent
          side="bottom"
          showCloseButton={false}
          aria-describedby={undefined}
          className={`${theme.surface} ${styles.sheet}`}
          overlayClassName={theme.overlay}
          data-reference-surface=""
        >
          <span className={styles.handle} aria-hidden="true" />
          <SheetTitle className={styles.sheetTitle}>
            {options?.folder.name}
          </SheetTitle>
          {options && (
            <div className={styles.actions}>
              <button
                type="button"
                className={styles.action}
                onClick={() => act(() => onBrand(options.owner))}
              >
                {copy.brand}
              </button>
              <button
                type="button"
                className={styles.action}
                onClick={() =>
                  act(() => onRenameFolder(options.owner.id, options.folder))
                }
              >
                {copy.rename}
              </button>
              <button
                type="button"
                className={`${styles.action} ${styles.danger}`}
                onClick={() =>
                  act(() => onDeleteFolder(options.owner.id, options.folder))
                }
              >
                {copy.deleteProject}
              </button>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
