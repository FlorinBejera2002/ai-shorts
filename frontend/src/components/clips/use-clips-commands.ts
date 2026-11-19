'use client'

import { useToast } from '@/components/ui/toast'
import type { ClipsLibrary, LibraryClip, LibraryCollection } from '@/lib/clips-library'
import { useTranslations } from 'next-intl'
import { useCallback, useState } from 'react'
import type { ClipCommands } from './clip-actions'
import type { ClipsNotice } from './clips-feedback'
import type { ProjectCommands } from './clips-projects'
import type { ClipsLibraryActions } from './use-clips-library'

/** Which project-name dialog is open: a new project (optionally for a clip) or a rename. */
type Naming = { project: LibraryCollection | null; clip: LibraryClip | null }

/**
 * Wires the page's menus, drag & drop and dialogs to the library mutations, and keeps the
 * confirmation toast and dialog state in one place.
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
  const errors = useToast()
  const [notice, setNotice] = useState<ClipsNotice | null>(null)
  const [busy, setBusy] = useState(false)
  const [naming, setNaming] = useState<Naming | null>(null)
  const [nameError, setNameError] = useState<string | null>(null)
  const [deletingClip, setDeletingClip] = useState<LibraryClip | null>(null)
  const [deletingProject, setDeletingProject] = useState<LibraryCollection | null>(null)
  const projects = library?.collections ?? []

  const notify = useCallback((message: string) => setNotice({ id: Date.now(), message }), [])
  const dismissNotice = useCallback(() => setNotice(null), [])

  async function move(clip: LibraryClip, projectId: string | null, projectName?: string) {
    if (clip.collectionId === projectId) return
    try {
      await actions.moveClip(clip.id, projectId)
      const name = projectName ?? projects.find((project) => project.id === projectId)?.name
      notify(projectId && name ? t('moved', { name }) : t('movedOut'))
    } catch {
      errors.add('error', t('failed'))
    }
  }

  async function toggleFavorite(clip: LibraryClip) {
    try {
      await actions.setFavorite(clip.id, !clip.favorite)
    } catch {
      errors.add('error', t('failed'))
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
      notify(t('deleted'))
    } catch {
      errors.add('error', t('failed'))
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
      notify(t('projectDeleted'))
    } catch {
      errors.add('error', t('failed'))
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
    notice,
    dismissNotice,
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
