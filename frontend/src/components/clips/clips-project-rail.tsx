'use client'

import theme from '@/components/calendar/publishing-theme.module.css'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { useToast } from '@/components/ui/toast'
import { Folder, MoreHorizontal, Plus } from 'lucide-react'
import { useState } from 'react'
import { useClipsCopy } from './clips-copy'
import type { ClipsWorkspaceProps } from './clips-project-types'
import { summarizeClipsProjects } from './clips-project-summary'
import styles from './clips-project-rail.module.css'

type Props = Pick<
  ClipsWorkspaceProps,
  | 'projects'
  | 'project'
  | 'folderId'
  | 'onMoveClip'
  | 'onCreateFolder'
  | 'onRenameFolder'
  | 'onDeleteFolder'
  | 'onBrand'
> & {
  onSelect: (projectId: string, folderId: string) => void
}

function isProjectClipDrag(dataTransfer: DataTransfer, projectId: string) {
  return dataTransfer.types.includes(
    `application/x-sneepcut-project-${projectId}`
  )
}

/** Desktop project navigation; clips can be dropped onto a project. */
export function ClipsProjectRail({
  projects,
  project,
  folderId,
  onSelect,
  onMoveClip,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onBrand
}: Props) {
  const copy = useClipsCopy()
  const toast = useToast()
  const [dragOver, setDragOver] = useState<string | null>(null)
  const { folders, total, unassigned } = summarizeClipsProjects(projects)
  const allActive = !project && folderId === 'all'

  return (
    <nav
      className={styles.rail}
      aria-label={copy.foldersTitle}
      data-clips-projects=""
    >
      <button
        type="button"
        className={styles.item}
        data-active={allActive}
        aria-current={allActive || undefined}
        data-clips-project="all"
        onClick={() => onSelect('', 'all')}
      >
        <span className={styles.name}>{copy.allClips}</span>
        <span className={styles.count}>{total}</span>
      </button>
      <div className={styles.heading}>
        <span>{copy.foldersTitle}</span>
        <button
          type="button"
          className={styles.add}
          aria-label={copy.newProject}
          onClick={onCreateFolder}
        >
          <Plus aria-hidden="true" />
        </button>
      </div>
      {folders.map(({ folder, owner, count }) => {
        const active = project?.id === owner.id && folderId === folder.id
        return (
          <div
            key={folder.id}
            className={styles.folder}
            data-active={active}
            data-dragover={dragOver === folder.id}
            onDragOver={(event) => {
              if (!isProjectClipDrag(event.dataTransfer, owner.id)) return
              event.preventDefault()
              event.dataTransfer.dropEffect = 'move'
              setDragOver(folder.id)
            }}
            onDragLeave={() => setDragOver(null)}
            onDrop={(event) => {
              event.preventDefault()
              setDragOver(null)
              if (!isProjectClipDrag(event.dataTransfer, owner.id)) return
              const clipId = event.dataTransfer.getData(
                'application/x-sneepcut-clip'
              )
              if (clipId)
                void onMoveClip(owner.id, clipId, folder.id).then((success) => {
                  if (!success) toast.add('error', copy.failed)
                })
            }}
          >
            <button
              type="button"
              className={styles.select}
              data-clips-project={folder.id}
              aria-current={active || undefined}
              onClick={() => onSelect(owner.id, folder.id)}
            >
              <Folder aria-hidden="true" />
              <span className={styles.name}>{folder.name}</span>
              {dragOver === folder.id ? (
                <span className={styles.drop}>{copy.dropHere}</span>
              ) : (
                <span className={styles.count}>{count}</span>
              )}
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild={true}>
                <button
                  type="button"
                  className={styles.more}
                  aria-label={copy.projectOptions(folder.name)}
                >
                  <MoreHorizontal aria-hidden="true" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                className={`${theme.surface} ${styles.menu}`}
                data-reference-surface=""
              >
                <DropdownMenuItem onSelect={() => onBrand(owner)}>
                  {copy.brand}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => onRenameFolder(owner.id, folder)}
                >
                  {copy.rename}
                </DropdownMenuItem>
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => onDeleteFolder(owner.id, folder)}
                >
                  {copy.deleteProject}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )
      })}
      <button
        type="button"
        className={`${styles.item} ${styles.unassigned}`}
        data-active={folderId === 'unassigned'}
        aria-current={folderId === 'unassigned' || undefined}
        data-clips-project="unassigned"
        onClick={() => onSelect('', 'unassigned')}
      >
        <span className={styles.name}>{copy.unassigned}</span>
        <span className={styles.count}>{unassigned}</span>
      </button>
    </nav>
  )
}
