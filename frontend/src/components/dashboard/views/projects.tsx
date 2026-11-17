'use client'

import theme from '@/components/calendar/publishing-theme.module.css'
import { ClipsBrandDialog } from '@/components/clips/clips-brand-dialog'
import { useClipsCopy } from '@/components/clips/clips-copy'
import {
  FolderDialog,
  ProjectDeleteDialog
} from '@/components/clips/clips-dialogs'
import { ClipsProjectWorkspace } from '@/components/clips/clips-project-workspace'
import type {
  Project,
  ProjectBrand,
  ProjectFolder
} from '@/components/clips/clips-project-types'
import {
  ClipsEmptyLibrary,
  ClipsGridSkeleton,
  ClipsLoadError
} from '@/components/clips/clips-states'
import styles from '@/components/clips/clips-workspace.module.css'
import { WorkspaceMobileHeader } from '@/components/dashboard/workspace-mobile-header'
import { useToast } from '@/components/ui/toast'
import { useApiResource } from '@/hooks/use-api-resource'
import { Link } from '@/i18n/navigation'
import { apiFetch } from '@/lib/auth'
import { Plus } from 'lucide-react'
import { useMemo, useState } from 'react'

const brandDefaults: Required<ProjectBrand> = {
  name: '',
  logoPath: '',
  logoUrl: '',
  primaryColor: '#7856FF',
  secondaryColor: '#18C99A',
  fontFamily: 'Manrope',
  subtitleFont: 'Manrope',
  subtitleColor: '#FFFFFF'
}

type FolderTarget = { projectId: string; folder: ProjectFolder }

export default function ProjectsPage() {
  const copy = useClipsCopy()
  const toast = useToast()
  const { data, error, reload } = useApiResource<{ projects: Project[] }>(
    '/api/projects'
  )
  const [projectId, setProjectId] = useState<string | null>(null)
  const [folderId, setFolderId] = useState<string | null | 'all'>('all')
  const [brandProjectId, setBrandProjectId] = useState<string | null>(null)
  const [folderDialog, setFolderDialog] = useState(false)
  const [folderName, setFolderName] = useState('')
  const [editingFolder, setEditingFolder] = useState<FolderTarget | null>(null)
  const [deletingFolder, setDeletingFolder] = useState<FolderTarget | null>(null)
  const [brand, setBrand] = useState<Required<ProjectBrand>>(brandDefaults)
  const [saving, setSaving] = useState(false)
  const projects = useMemo(() => data?.projects ?? [], [data])
  const project = projects.find((item) => item.id === projectId)
  const brandProject = projects.find((item) => item.id === brandProjectId)
  const total = projects.reduce((sum, owner) => sum + owner.clips.length, 0)

  async function mutate(path: string, options: RequestInit, reportError = true) {
    setSaving(true)
    try {
      const response = await apiFetch(path, {
        ...options,
        headers: { 'Content-Type': 'application/json', ...options.headers }
      })
      if (!response.ok) throw new Error('request failed')
      await reload()
      return true
    } catch {
      if (reportError) toast.add('error', copy.failed)
      return false
    } finally {
      setSaving(false)
    }
  }
  async function moveClip(
    ownerProjectId: string,
    clipId: string,
    destination: string | null
  ) {
    const done = await mutate(
      `/api/projects/${ownerProjectId}/clips/${clipId}`,
      { method: 'PATCH', body: JSON.stringify({ folderId: destination }) },
      false
    )
    if (done) toast.add('success', copy.saved)
    return done
  }
  async function saveFolder() {
    const ownerId = editingFolder?.projectId ?? project?.id ?? projects[0]?.id
    if (!ownerId || !folderName.trim()) return
    const done = await mutate(
      editingFolder
        ? `/api/projects/${ownerId}/folders/${editingFolder.folder.id}`
        : `/api/projects/${ownerId}/folders`,
      {
        method: editingFolder ? 'PATCH' : 'POST',
        body: JSON.stringify({ name: folderName.trim(), parentId: null })
      }
    )
    if (done) {
      setFolderDialog(false)
      setFolderName('')
      setEditingFolder(null)
    }
  }
  async function deleteFolder() {
    if (!deletingFolder) return
    const { projectId: ownerId, folder } = deletingFolder
    const done = await mutate(`/api/projects/${ownerId}/folders/${folder.id}`, {
      method: 'DELETE'
    })
    if (!done) return
    setDeletingFolder(null)
    if (folderId === folder.id) {
      setProjectId(null)
      setFolderId('all')
    }
  }
  function openBrand(owner: Project) {
    setBrandProjectId(owner.id)
    setBrand({ ...brandDefaults, ...owner.brandKit })
  }
  async function saveBrand() {
    if (!brandProject) return
    const { logoUrl: _logoUrl, ...persistedBrand } = brand
    const done = await mutate(`/api/projects/${brandProject.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ brandKit: persistedBrand })
    })
    if (done) {
      setBrandProjectId(null)
      toast.add('success', copy.saved)
    }
  }
  async function uploadProjectLogo(file: File) {
    const form = new FormData()
    form.set('file', file)
    setSaving(true)
    try {
      const upload = await apiFetch('/api/brand/logo', {
        method: 'POST',
        body: form
      })
      const uploaded = await upload.json()
      if (!upload.ok || typeof uploaded.logo_path !== 'string')
        throw new Error('upload failed')
      const preview = await apiFetch(
        `/api/brand/logo?logo_path=${encodeURIComponent(uploaded.logo_path)}`
      )
      const resolved = await preview.json()
      if (!preview.ok || typeof resolved.logo_url !== 'string')
        throw new Error('preview failed')
      setBrand((current) => ({
        ...current,
        logoPath: uploaded.logo_path,
        logoUrl: resolved.logo_url
      }))
    } catch {
      toast.add('error', copy.failed)
    } finally {
      setSaving(false)
    }
  }
  function selectProject(id: string) {
    setProjectId(id)
    setFolderId('all')
  }

  return (
    <div
      className={`${theme.surface} ${styles.workspace}`}
      data-clips-workspace=""
      data-reference-surface=""
    >
      <WorkspaceMobileHeader variant="menu" />
      <div className={styles.inner}>
        <header className={styles.header}>
          <h1>{copy.title}</h1>
          {data && <span className={styles.count}>{total}</span>}
          <span className={styles.spacer} />
          <Link
            href="/dashboard/create"
            className={styles.newClip}
            aria-label={copy.newClip}
          >
            <Plus aria-hidden="true" />
            <span>{copy.newClip}</span>
          </Link>
        </header>
        {!data ? (
          error ? (
            <ClipsLoadError onRetry={() => void reload()} />
          ) : (
            <ClipsGridSkeleton />
          )
        ) : projects.length ? (
          <ClipsProjectWorkspace
            projects={projects}
            project={project}
            folderId={folderId}
            onProject={selectProject}
            onFolder={setFolderId}
            onBrand={openBrand}
            onMoveClip={moveClip}
            onCreateFolder={() => {
              setEditingFolder(null)
              setFolderName('')
              setFolderDialog(true)
            }}
            onRenameFolder={(ownerId, folder) => {
              setEditingFolder({ projectId: ownerId, folder })
              setFolderName(folder.name)
              setFolderDialog(true)
            }}
            onDeleteFolder={(ownerId, folder) =>
              setDeletingFolder({ projectId: ownerId, folder })
            }
            onDeleted={reload}
          />
        ) : (
          <ClipsEmptyLibrary />
        )}
      </div>
      <ClipsBrandDialog
        open={brandProject !== undefined}
        projectName={brandProject?.name ?? ''}
        brand={brand}
        saving={saving}
        onOpenChange={(open) => {
          if (!open) setBrandProjectId(null)
        }}
        onBrand={setBrand}
        onLogo={uploadProjectLogo}
        onSubmit={saveBrand}
      />
      <FolderDialog
        open={folderDialog}
        editing={Boolean(editingFolder)}
        name={folderName}
        saving={saving}
        onOpenChange={setFolderDialog}
        onName={setFolderName}
        onSubmit={saveFolder}
      />
      <ProjectDeleteDialog
        name={deletingFolder?.folder.name ?? null}
        busy={saving}
        onCancel={() => setDeletingFolder(null)}
        onConfirm={() => void deleteFolder()}
      />
    </div>
  )
}
