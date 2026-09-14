'use client'

import '@/components/clips/media-workbench.css'
import { ClipCard as LibraryClipCard } from '@/components/clips/clip-card'
import { ClipsLibraryToolbar } from '@/components/clips/clips-library-toolbar'
import { ClipsPagination } from '@/components/clips/clips-pagination'
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PageHeader } from '@/components/ui/page-header'
import { useToast } from '@/components/ui/toast'
import { useApiResource } from '@/hooks/use-api-resource'
import { Link } from '@/i18n/navigation'
import { apiFetch } from '@/lib/auth'
import {
  CLIPS_PAGE_SIZE,
  clipsLibraryHref,
  hasActiveClipFilters,
  parseClipsLibraryQuery
} from '@/lib/clips-library'
import {
  Folder,
  FolderOpen,
  Inbox,
  MoreHorizontal,
  Palette,
  Pencil,
  Plus,
  Sparkles,
  Trash2
} from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import Image from 'next/image'
import { useSearchParams } from 'next/navigation'
import { type CSSProperties, useMemo, useState } from 'react'

type ProjectFolder = { id: string; parentId: string | null; name: string }
type ProjectClip = {
  id: string
  folderId: string | null
  title: string
  duration: number
  viralScore: number | null
  aspectRatio: string
  thumbnailUrl: string | null
  hookText: string | null
  resolution: string
  hasSubtitles: boolean
  createdAt: string
}
type ProjectBrand = {
  name?: string
  logoPath?: string
  logoUrl?: string
  primaryColor?: string
  secondaryColor?: string
  fontFamily?: string
  subtitleFont?: string
  subtitleColor?: string
}
type Project = {
  id: string
  name: string
  status: string
  source: string
  brandKit: ProjectBrand
  folders: ProjectFolder[]
  clips: ProjectClip[]
  updatedAt: string
}

const translations = {
  ro: {
    title: 'Clipuri',
    description: 'Toate clipurile tale, organizate simplu pe proiecte.',
    newProject: 'Clip nou',
    projects: 'Proiectele tale',
    allProjects: 'Toate clipurile',
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

  if (!data) return <ApiState error={error} retry={reload} />

  async function mutate(path: string, options: RequestInit) {
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
      toast.add('error', text.failed)
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
      }
    )
    if (done) toast.add('success', text.saved)
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
    <div className="media-workbench projects-workspace">
      <PageHeader
        title={text.title}
        description={text.description}
        actions={
          <Button asChild={true}>
            <Link href="/dashboard/create">
              <Plus aria-hidden="true" />
              {text.newProject}
            </Link>
          </Button>
        }
      />
      {projects.length ? (
        <ProjectsWorkspace
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

type WorkspaceProps = {
  projects: Project[]
  project?: Project
  folderId: string | null | 'all'
  text: Copy
  onProject: (id: string) => void
  onFolder: (id: string | null | 'all') => void
  onBrand: (project: Project) => void
  onMoveClip: (
    projectId: string,
    clipId: string,
    folderId: string | null
  ) => void
  onCreateFolder: () => void
  onRenameFolder: (projectId: string, folder: ProjectFolder) => void
  onDeleteFolder: (projectId: string, folderId: string) => void
}
function ProjectsWorkspace(props: WorkspaceProps) {
  return (
    <div className="projects-layout">
      <FolderRail
        projects={props.projects}
        project={props.project}
        folderId={props.folderId}
        text={props.text}
        onProject={props.onProject}
        onFolder={props.onFolder}
        onMoveClip={props.onMoveClip}
        onCreateFolder={props.onCreateFolder}
        onRenameFolder={props.onRenameFolder}
        onDeleteFolder={props.onDeleteFolder}
        onBrand={props.onBrand}
      />
      <ProjectBrowser {...props} />
    </div>
  )
}

function FolderRail({
  projects,
  project,
  folderId,
  text,
  onProject,
  onFolder,
  onMoveClip,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onBrand
}: {
  projects: Project[]
  project?: Project
  folderId: string | null | 'all'
  text: Copy
  onProject: (id: string) => void
  onFolder: (id: string | null | 'all') => void
  onMoveClip: (
    projectId: string,
    clipId: string,
    folderId: string | null
  ) => void
  onCreateFolder: () => void
  onRenameFolder: (projectId: string, folder: ProjectFolder) => void
  onDeleteFolder: (projectId: string, folderId: string) => void
  onBrand: (project: Project) => void
}) {
  const [dragOver, setDragOver] = useState<string | null>(null)
  const folders = projects.flatMap((owner) =>
    owner.folders.map((folder) => ({ folder, owner }))
  )
  const unassignedCount = projects.reduce(
    (total, owner) =>
      total + owner.clips.filter((clip) => clip.folderId === null).length,
    0
  )
  return (
    <aside className="projects-rail" aria-label={text.foldersTitle}>
      <div className="projects-rail-heading">
        <span>{text.foldersTitle}</span>
        <button
          type="button"
          className="projects-rail-add"
          onClick={onCreateFolder}
          aria-label={text.createFolder}
        >
          <Plus aria-hidden="true" />
        </button>
      </div>
      <div className="projects-rail-list">
        <div
          className="projects-rail-item projects-rail-unassigned"
          data-active={!project && folderId === 'unassigned'}
        >
          <button
            type="button"
            className="projects-rail-select"
            onClick={() => {
              onProject('')
              onFolder('unassigned')
            }}
          >
            <span className="projects-rail-folder-icon">
              <Inbox aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <strong>{text.unassignedClips}</strong>
              <small>
                {unassignedCount} {text.clips}
              </small>
            </span>
          </button>
        </div>
        {folders.map(({ folder, owner }) => {
          const dropKey = `${owner.id}:${folder.id}`
          const clipCount = owner.clips.filter(
            (clip) => clip.folderId === folder.id
          ).length
          return (
            <div
              key={dropKey}
              className="projects-rail-item"
              data-active={project?.id === owner.id && folderId === folder.id}
              data-dragover={dragOver === dropKey}
              onDragOver={(event) => {
                event.preventDefault()
                event.dataTransfer.dropEffect = 'move'
                setDragOver(dropKey)
              }}
              onDragLeave={() => setDragOver(null)}
              onDrop={(event) => {
                event.preventDefault()
                setDragOver(null)
                const clipId = event.dataTransfer.getData(
                  'application/x-sneepcut-clip'
                )
                if (clipId) onMoveClip(owner.id, clipId, folder.id)
              }}
            >
              <button
                type="button"
                className="projects-rail-select"
                onClick={() => {
                  onProject(owner.id)
                  onFolder(folder.id)
                }}
              >
                <span className="projects-rail-folder-icon">
                  <Folder aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <strong>{folder.name}</strong>
                  <small>
                    {clipCount} {text.clips}
                  </small>
                </span>
              </button>
              {dragOver === dropKey ? (
                <span className="projects-rail-drop-hint">{text.dropHere}</span>
              ) : (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild={true}>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={folder.name}
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
                    >
                      <Trash2 aria-hidden="true" />
                      {text.deleteFolder}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          )
        })}
      </div>
    </aside>
  )
}

function ProjectBrowser({ projects, project, folderId, text }: WorkspaceProps) {
  const locale = useLocale()
  const t = useTranslations('clips')
  const searchParams = useSearchParams()
  const query = parseClipsLibraryQuery(Object.fromEntries(searchParams))
  const sourceClips = project
    ? project.clips.map((clip) => ({
        ...clip,
        projectId: project.id,
        folderName:
          project.folders.find((folder) => folder.id === clip.folderId)?.name ??
          null
      }))
    : projects.flatMap((owner) =>
        owner.clips.map((clip) => ({
          ...clip,
          projectId: owner.id,
          folderName:
            owner.folders.find((folder) => folder.id === clip.folderId)?.name ??
            null
        }))
      )
  const matchingClips = sourceClips
    .filter((clip) =>
      folderId === 'unassigned'
        ? clip.folderId === null
        : !project || folderId === 'all' || clip.folderId === folderId
    )
    .filter((clip) => {
      const search = query.search.toLocaleLowerCase(locale)
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
  const total = matchingClips.length
  const totalPages = Math.max(1, Math.ceil(total / CLIPS_PAGE_SIZE))
  const currentPage = Math.min(query.page, totalPages)
  const clips = matchingClips.slice(
    (currentPage - 1) * CLIPS_PAGE_SIZE,
    currentPage * CLIPS_PAGE_SIZE
  )
  const firstResult = total === 0 ? 0 : (currentPage - 1) * CLIPS_PAGE_SIZE + 1
  const lastResult = Math.min(total, currentPage * CLIPS_PAGE_SIZE)
  const filtersActive = hasActiveClipFilters(query)

  return (
    <section className="projects-browser">
      <ClipsLibraryToolbar
        showSearch={sourceClips.length > 15 || filtersActive}
        query={query}
        labels={{
          search: t('searchLabel'),
          searchPlaceholder: t('searchPlaceholder'),
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
      {clips.length > 0 ? (
        <>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <p aria-live="polite">
              {t('showingResults', {
                first: firstResult,
                last: lastResult,
                total
              })}
            </p>
            {filtersActive && (
              <Link
                href={clipsLibraryHref(query, {
                  search: '',
                  score: 'all',
                  aspect: 'all',
                  subtitles: 'all',
                  sort: 'newest',
                  page: 1
                })}
                className="font-semibold text-foreground hover:underline"
              >
                {t('clearFilters')}
              </Link>
            )}
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {clips.map((clip, index) => (
              <div
                key={clip.id}
                className="clips-organized-card"
                draggable={true}
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = 'move'
                  event.dataTransfer.setData(
                    'application/x-sneepcut-clip',
                    clip.id
                  )
                  event.currentTarget.dataset.dragging = 'true'
                }}
                onDragEnd={(event) =>
                  delete event.currentTarget.dataset.dragging
                }
              >
                <LibraryClipCard
                  index={index}
                  locale={locale}
                  labels={{
                    open: t('openClip'),
                    score: t('viralScoreLabel'),
                    subtitles: t('hasSubtitles')
                  }}
                  clip={{
                    ...clip,
                    hookText: clip.hookText,
                    viralScore: clip.viralScore ?? 0
                  }}
                  projectName={clip.folderName}
                />
              </div>
            ))}
          </div>
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
        </>
      ) : (
        <div className="projects-empty">
          <FolderOpen aria-hidden="true" />
          <h3>{filtersActive ? t('noMatches') : text.emptyFolder}</h3>
          <p>{filtersActive ? t('noMatchesDesc') : text.emptyHint}</p>
        </div>
      )}
    </section>
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
}: { label: string; value: string; onChange: (value: string) => void }) {
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
}: { label: string; value: string; onChange: (value: string) => void }) {
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
