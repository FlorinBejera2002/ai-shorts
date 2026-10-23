'use client'

import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import {
  Folder,
  Grid2X2,
  MoreHorizontal,
  Palette,
  Pencil,
  Plus,
  Trash2
} from 'lucide-react'
import { useState } from 'react'
import type { ClipsWorkspaceProps } from './clips-project-types'
import styles from './clips-project-rail.module.css'

type Props = Pick<
  ClipsWorkspaceProps,
  | 'projects'
  | 'project'
  | 'folderId'
  | 'text'
  | 'onMoveClip'
  | 'onCreateFolder'
  | 'onRenameFolder'
  | 'onDeleteFolder'
  | 'onBrand'
> & {
  onSelect: (projectId: string, folderId: string) => void
}

export function ClipsProjectRail({
  projects,
  project,
  folderId,
  text,
  onSelect,
  onMoveClip,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onBrand
}: Props) {
  const [dragOver, setDragOver] = useState<string | null>(null)
  const toast = useToast()
  const folders = projects.flatMap((owner) =>
    owner.folders.map((folder) => ({ folder, owner }))
  )
  const total = projects.reduce((count, owner) => count + owner.clips.length, 0)

  return (
    <aside
      className={styles.rail}
      aria-label={text.foldersTitle}
      data-clips-projects=""
    >
      <button
        type="button"
        className={styles.item}
        data-active={!project && folderId === 'all'}
        aria-pressed={!project && folderId === 'all'}
        data-clips-project="all"
        onClick={() => onSelect('', 'all')}
      >
        <Grid2X2 aria-hidden="true" />
        <span className={styles.name}>{text.allProjects}</span>
        <span className={styles.count}>{total}</span>
      </button>
      <div className={styles.heading}>
        <span>{text.foldersTitle}</span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onCreateFolder}
          aria-label={text.createFolder}
          className="size-7"
        >
          <Plus aria-hidden="true" />
        </Button>
      </div>
      <div className={styles.folders}>
        {folders.map(({ folder, owner }) => {
          const active = project?.id === owner.id && folderId === folder.id
          const count = owner.clips.filter(
            (clip) => clip.folderId === folder.id
          ).length
          return (
            <div
              key={folder.id}
              className={styles.folder}
              data-active={active}
              data-dragover={dragOver === folder.id}
              onDragOver={(event) => {
                if (
                  !event.dataTransfer.types.includes(
                    `application/x-sneepcut-project-${owner.id}`
                  )
                )
                  return
                event.preventDefault()
                event.dataTransfer.dropEffect = 'move'
                setDragOver(folder.id)
              }}
              onDragLeave={() => setDragOver(null)}
              onDrop={(event) => {
                event.preventDefault()
                setDragOver(null)
                if (
                  !event.dataTransfer.types.includes(
                    `application/x-sneepcut-project-${owner.id}`
                  )
                )
                  return
                const clipId = event.dataTransfer.getData(
                  'application/x-sneepcut-clip'
                )
                if (clipId)
                  void onMoveClip(owner.id, clipId, folder.id).then(
                    (success) => {
                      if (!success) toast.add('error', text.failed)
                    }
                  )
              }}
            >
              <button
                type="button"
                className={styles.select}
                data-clips-project={folder.id}
                aria-pressed={active}
                onClick={() => onSelect(owner.id, folder.id)}
              >
                <Folder aria-hidden="true" />
                <span className={styles.name}>{folder.name}</span>
                <span className={styles.count}>{count}</span>
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild={true}>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={styles.menuTrigger}
                    aria-label={`${folder.name}: ${text.organization}`}
                  >
                    <MoreHorizontal aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => onBrand(owner)}>
                    <Palette aria-hidden="true" />
                    {text.brand}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => onRenameFolder(owner.id, folder)}
                  >
                    <Pencil aria-hidden="true" />
                    {text.renameFolder}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => onDeleteFolder(owner.id, folder.id)}
                    className="text-destructive"
                  >
                    <Trash2 aria-hidden="true" />
                    {text.deleteFolder}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )
        })}
        <button
          type="button"
          className={styles.item}
          data-active={folderId === 'unassigned'}
          aria-pressed={folderId === 'unassigned'}
          data-clips-project="unassigned"
          onClick={() => onSelect('', 'unassigned')}
        >
          <Folder aria-hidden="true" />
          <span className={styles.name}>{text.unassignedClips}</span>
          <span className={styles.count}>
            {projects.reduce(
              (count, owner) =>
                count +
                owner.clips.filter((clip) => clip.folderId === null).length,
              0
            )}
          </span>
        </button>
      </div>
    </aside>
  )
}
