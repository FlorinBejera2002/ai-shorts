'use client'

import { toast } from '@/lib/toast'
import type { ClipsLibrary, LibraryClip, LibraryCollection } from '@/lib/clips-library'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import type { ClipCommands } from './clip-actions'
import type { ProjectCommands } from './clips-projects'
import type { ClipsLibraryActions } from './use-clips-library'

/** Which project-name dialog is open: a new project (optionally for a clip) or a rename. */
type Naming = { project: LibraryCollection | null; clip: LibraryClip | null }

/**
 * Wires the page's menus, drag & drop and dialogs to the library mutations. Results are
 * reported with the shared toast; dialog state stays here.
 */
export function useClipsCommands({
  library,
  actions,
  onProjectDeleted
}: {
  library: ClipsLibrary | null
  actions: ClipsLibraryActions
  onProjectDeleted: (id: string) => void
}) {
  const t = useTranslations('clipsLibrary')
  const [busy, setBusy] = useState(false)
  const [naming, setNaming] = useState<Naming | null>(null)
  const [nameError, setNameError] = useState<string | null>(null)
  const [deletingClip, setDeletingClip] = useState<LibraryClip | null>(null)
  const [deletingProject, setDeletingProject] = useState<LibraryCollection | null>(null)
  const projects = library?.collections ?? []

  async function move(clip: LibraryClip, projectId: string | null, projectName?: string) {
    if (clip.collectionId === projectId) return
    try {
      await actions.moveClip(clip.id, projectId)
      const name = projectName ?? projects.find((project) => project.id === projectId)?.name
      toast.success(projectId && name ? t('moved', { name }) : t('movedOut'))
    } catch {
      toast.error(t('failed'))
    }
  }

  async function toggleFavorite(clip: LibraryClip) {
    try {
      await actions.setFavorite(clip.id, !clip.favorite)
    } catch {
      toast.error(t('failed'))
    }
  }

  async function submitName(name: string) {
    if (!naming) return
    setBusy(true)
    setNameError(null)
    try {
      if (naming.project) await actions.renameProject(naming.project.id, name)
      else {
        const id = await actions.createProject(name)
        if (naming.clip) await move(naming.clip, id, name)
      }
      setNaming(null)
    } catch (error) {
      setNameError((error as { status?: number }).status === 409 ? t('nameTaken') : t('failed'))
    } finally {
      setBusy(false)
    }
  }

  async function confirmDeleteClip() {
    if (!deletingClip) return
    setBusy(true)
    try {
      await actions.deleteClip(deletingClip.id)
      setDeletingClip(null)
      toast.success(t('deleted'))
    } catch {
      toast.error(t('failed'))
    } finally {
      setBusy(false)
    }
  }

  async function confirmDeleteProject() {
    if (!deletingProject) return
    setBusy(true)
    try {
      await actions.deleteProject(deletingProject.id)
      onProjectDeleted(deletingProject.id)
      setDeletingProject(null)
      toast.success(t('projectDeleted'))
    } catch {
      toast.error(t('failed'))
    } finally {
      setBusy(false)
    }
  }

  function openNaming(next: Naming) {
    setNameError(null)
    setNaming(next)
  }

  const clipCommands: ClipCommands = {
    projects,
    onMove: (clip, projectId) => void move(clip, projectId),
    onFavorite: (clip) => void toggleFavorite(clip),
    onNewProject: (clip) => openNaming({ project: null, clip }),
    onDelete: setDeletingClip
  }
  const projectCommands: ProjectCommands = {
    onNew: () => openNaming({ project: null, clip: null }),
    onRename: (project) => openNaming({ project, clip: null }),
    onDelete: setDeletingProject
  }

  return {
    clipCommands,
    projectCommands,
    move,
    dialogs: {
      busy,
      naming,
      nameError,
      deletingClip,
      deletingProject,
      submitName,
      confirmDeleteClip,
      confirmDeleteProject,
      closeNaming: () => setNaming(null),
      closeDeleteClip: () => setDeletingClip(null),
      closeDeleteProject: () => setDeletingProject(null)
    }
  }
}
