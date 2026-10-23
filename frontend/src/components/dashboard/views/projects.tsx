'use client'

import '@/components/clips/media-workbench.css'
import { ClipsProjectWorkspace } from '@/components/clips/clips-project-workspace'
import type {
  Project,
  ProjectBrand
} from '@/components/clips/clips-project-types'
import styles from '@/components/clips/clips-workspace.module.css'
import { WorkspaceMobileHeader } from '@/components/dashboard/workspace-mobile-header'
import { ApiState } from '@/components/shared/api-state'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/toast'
import { useApiResource } from '@/hooks/use-api-resource'
import { Link } from '@/i18n/navigation'
import { apiFetch } from '@/lib/auth'
import { Palette, Plus, Sparkles } from 'lucide-react'
import { useLocale } from 'next-intl'
import Image from 'next/image'
import { type CSSProperties, useMemo, useState } from 'react'

const translations = {
  ro: {
    title: 'Clipuri',
    description: 'Toate clipurile tale, organizate simplu pe proiecte.',
    newProject: 'Clip nou',
    projects: 'Proiectele tale',
    allProjects: 'Toate clipurile',
    organization: 'Organizare',
    foldersTitle: 'Proiecte',
    unassignedClips: 'Clipuri fără proiect',
    dropHere: 'AdaugÄƒ aici',
    allClips: 'Toate clipurile',
    newFolder: 'Proiect nou',
    folderName: 'Numele proiectului',
    renameFolder: 'Redenumește proiectul',
    deleteFolder: 'Șterge proiectul',
    createFolder: 'Creează proiect',
    search: 'Caută clipuri în proiect…',
    emptyFolder: 'Proiectul este gol',
    emptyHint: 'Mută aici clipuri din meniul fiecărui card.',
    clips: 'clipuri',
    folders: 'proiecte',
    moveTo: 'Mută în',
    root: 'Fără proiect',
    brand: 'Brand kit',
    brandTitle: 'Brand kit pentru proiect',
    brandDescription:
      'Setările aparțin doar proiectului selectat și nu schimbă brandul global.',
    kitName: 'Nume brand',
    logo: 'Logo proiect',
    uploadLogo: 'Alege logo',
    primary: 'Culoare principală',
    secondary: 'Culoare secundară',
    font: 'Font',
    subtitle: 'Culoare subtitrări',
    save: 'Salvează',
    cancel: 'Renunță',
    saved: 'Modificările au fost salvate.',
    failed: 'Modificarea nu a putut fi salvată.',
    noProjects: 'Nu există încă proiecte.',
    noResults: 'Niciun clip nu corespunde căutării.'
  },
  en: {
    title: 'Clips',
    description: 'All your clips, simply organized into projects.',
    newProject: 'New clip',
    projects: 'Your projects',
    allProjects: 'All clips',
    organization: 'Organization',
    foldersTitle: 'Projects',
    unassignedClips: 'Clips without a project',
    dropHere: 'Add here',
    allClips: 'All clips',
    newFolder: 'New project',
    folderName: 'Project name',
    createFolder: 'Create project',
    renameFolder: 'Rename project',
    deleteFolder: 'Delete project',
    search: 'Search clips in this project…',
    emptyFolder: 'This project is empty',
    emptyHint: 'Move clips here from each card menu.',
    clips: 'clips',
    folders: 'projects',
    moveTo: 'Move to',
    root: 'Without a project',
    brand: 'Brand kit',
    brandTitle: 'Project brand kit',
    brandDescription:
      'These settings belong to this project only and do not change the workspace brand.',
    kitName: 'Brand name',
    logo: 'Project logo',
    uploadLogo: 'Choose logo',
    primary: 'Primary color',
    secondary: 'Secondary color',
    font: 'Typeface',
    subtitle: 'Caption color',
    save: 'Save changes',
    cancel: 'Cancel',
    saved: 'Changes saved.',
    failed: 'The change could not be saved.',
    noProjects: 'There are no projects yet.',
    noResults: 'No clips match this search.'
  }
} as const
type Copy = (typeof translations)[keyof typeof translations]
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

export default function ProjectsPage() {
  const locale = useLocale()
  const text = locale === 'ro' ? translations.ro : translations.en
  const toast = useToast()
  const { data, error, reload } = useApiResource<{ projects: Project[] }>(
    '/api/projects'
  )
  const [projectId, setProjectId] = useState<string | null>(null)
  const [folderId, setFolderId] = useState<string | null | 'all'>('all')
  const [brandDialog, setBrandDialog] = useState(false)
  const [folderDialog, setFolderDialog] = useState(false)
  const [folderName, setFolderName] = useState('')
  const [editingFolder, setEditingFolder] = useState<{
    projectId: string
    folderId: string
  } | null>(null)
  const [brand, setBrand] = useState<Required<ProjectBrand>>(brandDefaults)
  const [saving, setSaving] = useState(false)
  const projects = useMemo(() => data?.projects ?? [], [data])
  const project = projects.find((item) => item.id === projectId)

  async function mutate(
    path: string,
    options: RequestInit,
    reportError = true
  ) {
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
      if (reportError) toast.add('error', text.failed)
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
      {
        method: 'PATCH',
        body: JSON.stringify({ folderId: destination })
      },
      false
    )
    if (done) toast.add('success', text.saved)
    return done
  }
  async function saveFolder() {
    const ownerId = editingFolder?.projectId ?? project?.id ?? projects[0]?.id
    if (!ownerId || !folderName.trim()) return
    const done = await mutate(
      editingFolder
        ? `/api/projects/${ownerId}/folders/${editingFolder.folderId}`
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
  async function deleteFolder(ownerId: string, targetId: string) {
    if (!window.confirm(text.deleteFolder)) return
    const done = await mutate(`/api/projects/${ownerId}/folders/${targetId}`, {
      method: 'DELETE'
    })
    if (done && folderId === targetId) {
      setProjectId(null)
      setFolderId('all')
    }
  }
  function openBrand(owner: Project) {
    setProjectId(owner.id)
    setBrand({ ...brandDefaults, ...owner.brandKit })
    setBrandDialog(true)
  }
  async function saveBrand() {
    if (!project) return
    const { logoUrl: _logoUrl, ...persistedBrand } = brand
    const done = await mutate(`/api/projects/${project.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ brandKit: persistedBrand })
    })
    if (done) {
      setBrandDialog(false)
      toast.add('success', text.saved)
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
      toast.add('error', text.failed)
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
      className={`${styles.workspace} media-workbench projects-workspace`}
      data-clips-workspace=""
    >
      <WorkspaceMobileHeader />
      <header className={styles.header}>
        <div className={styles.heading}>
          <h1>{text.title}</h1>
          {data && (
            <span className={styles.count}>
              {projects.reduce((total, owner) => total + owner.clips.length, 0)}
            </span>
          )}
        </div>
        <Button asChild={true} className={styles.newClip}>
          <Link href="/dashboard/create">
            <Plus aria-hidden="true" />
            {text.newProject}
          </Link>
        </Button>
      </header>
      {!data ? (
        <ApiState error={error} retry={reload} />
      ) : projects.length ? (
        <ClipsProjectWorkspace
          projects={projects}
          project={project}
          folderId={folderId}
          text={text}
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
            setEditingFolder({ projectId: ownerId, folderId: folder.id })
            setFolderName(folder.name)
            setFolderDialog(true)
          }}
          onDeleteFolder={deleteFolder}
          onDeleted={reload}
        />
      ) : (
        <EmptyProjects text={text} />
      )}
      <BrandEditor
        open={brandDialog}
        project={project}
        brand={brand}
        saving={saving}
        text={text}
        onOpen={setBrandDialog}
        onBrand={setBrand}
        onLogo={uploadProjectLogo}
        onSubmit={saveBrand}
      />
      <FolderDialog
        open={folderDialog}
        editing={Boolean(editingFolder)}
        name={folderName}
        saving={saving}
        text={text}
        onOpen={setFolderDialog}
        onName={setFolderName}
        onSubmit={saveFolder}
      />
    </div>
  )
}

function FolderDialog({
  open,
  editing,
  name,
  saving,
  text,
  onOpen,
  onName,
  onSubmit
}: {
  open: boolean
  editing: boolean
  name: string
  saving: boolean
  text: Copy
  onOpen: (open: boolean) => void
  onName: (name: string) => void
  onSubmit: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {editing ? text.renameFolder : text.createFolder}
          </DialogTitle>
        </DialogHeader>
        <div>
          <Label htmlFor="folder-name">{text.folderName}</Label>
          <Input
            id="folder-name"
            autoFocus={true}
            className="mt-2"
            value={name}
            maxLength={80}
            onChange={(event) => onName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.nativeEvent.isComposing)
                onSubmit()
            }}
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpen(false)}>
            {text.cancel}
          </Button>
          <Button disabled={!name.trim() || saving} onClick={onSubmit}>
            {editing ? text.renameFolder : text.createFolder}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function BrandEditor({
  open,
  project,
  brand,
  saving,
  text,
  onOpen,
  onBrand,
  onLogo,
  onSubmit
}: {
  open: boolean
  project?: Project
  brand: Required<ProjectBrand>
  saving: boolean
  text: Copy
  onOpen: (open: boolean) => void
  onBrand: (brand: Required<ProjectBrand>) => void
  onLogo: (file: File) => void
  onSubmit: () => void
}) {
  const update = (field: keyof ProjectBrand, value: string) =>
    onBrand({ ...brand, [field]: value })
  return (
    <Dialog open={open} onOpenChange={onOpen}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{text.brandTitle}</DialogTitle>
          <DialogDescription>{text.brandDescription}</DialogDescription>
        </DialogHeader>
        <div className="projects-brand-editor">
          <div
            className="projects-brand-preview"
            style={
              {
                '--brand-primary': brand.primaryColor,
                '--brand-secondary': brand.secondaryColor,
                '--brand-caption': brand.subtitleColor,
                fontFamily: brand.fontFamily
              } as CSSProperties
            }
          >
            <span>{brand.name || project?.name}</span>
            <strong>
              YOUR NEXT
              <br />
              BIG MOMENT
            </strong>
            <small>Caption preview</small>
          </div>
          <div className="projects-brand-fields">
            <div className="projects-logo-field">
              <Label>{text.logo}</Label>
              <div className="projects-logo-control">
                <span className="projects-logo-preview">
                  {brand.logoUrl ? (
                    <Image
                      src={brand.logoUrl}
                      alt=""
                      fill={true}
                      sizes="48px"
                    />
                  ) : (
                    <Palette aria-hidden="true" />
                  )}
                </span>
                <Button asChild={true} variant="outline" size="sm">
                  <label>
                    {text.uploadLogo}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      hidden={true}
                      disabled={saving}
                      onChange={(event) => {
                        const file = event.target.files?.[0]
                        if (file) onLogo(file)
                        event.target.value = ''
                      }}
                    />
                  </label>
                </Button>
              </div>
            </div>
            <BrandField
              label={text.kitName}
              value={brand.name}
              onChange={(value) => update('name', value)}
            />
            <BrandField
              label={text.font}
              value={brand.fontFamily}
              onChange={(value) =>
                onBrand({ ...brand, fontFamily: value, subtitleFont: value })
              }
            />
            <ColorField
              label={text.primary}
              value={brand.primaryColor}
              onChange={(value) => update('primaryColor', value)}
            />
            <ColorField
              label={text.secondary}
              value={brand.secondaryColor}
              onChange={(value) => update('secondaryColor', value)}
            />
            <ColorField
              label={text.subtitle}
              value={brand.subtitleColor}
              onChange={(value) => update('subtitleColor', value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpen(false)}>
            {text.cancel}
          </Button>
          <Button disabled={saving} onClick={onSubmit}>
            {text.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function EmptyProjects({ text }: { text: Copy }) {
  return (
    <Card className="projects-empty projects-empty-page">
      <span className="projects-empty-icon">
        <Sparkles aria-hidden="true" />
      </span>
      <h2>{text.noProjects}</h2>
      <p>{text.description}</p>
      <Button asChild={true} className="mt-2">
        <Link href="/dashboard/create">
          <Plus aria-hidden="true" />
          {text.newProject}
        </Link>
      </Button>
    </Card>
  )
}
function BrandField({
  label,
  value,
  onChange
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  const id = `brand-${label.toLowerCase().replace(/\s+/g, '-')}`
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        maxLength={100}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  )
}
function ColorField({
  label,
  value,
  onChange
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <label className="projects-color-field">
      <span>{label}</span>
      <span>
        <input
          aria-label={label}
          type="color"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        <code>{value.toUpperCase()}</code>
      </span>
    </label>
  )
}
