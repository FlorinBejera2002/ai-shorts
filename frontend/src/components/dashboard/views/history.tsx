'use client'

import '@/components/clips/media-workbench.css'
import { ApiState } from '@/components/shared/api-state'
import { Badge } from '@/components/ui/badge'
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
  DropdownMenuSeparator,
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
  ChevronRight,
  Folder,
  FolderOpen,
  Grid2X2,
  MoreHorizontal,
  Palette,
  Play,
  Plus,
  Search,
  Sparkles
} from 'lucide-react'
import { useLocale } from 'next-intl'
import Image from 'next/image'
import { type CSSProperties, useEffect, useMemo, useState } from 'react'

type ProjectFolder = { id: string; parentId: string | null; name: string }
type ProjectClip = {
  id: string
  folderId: string | null
  title: string
  duration: number
  viralScore: number | null
  aspectRatio: string
  thumbnailUrl: string | null
}
type ProjectBrand = {
  name?: string
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
    title: 'Proiecte',
    description:
      'Clipurile, folderele și identitatea fiecărei campanii, într-un singur loc.',
    newProject: 'Proiect nou',
    projects: 'Proiectele tale',
    allClips: 'Toate clipurile',
    newFolder: 'Folder nou',
    folderName: 'Numele folderului',
    createFolder: 'Creează folder',
    search: 'Caută clipuri în proiect…',
    emptyFolder: 'Folderul este gol',
    emptyHint: 'Mută aici clipuri din meniul fiecărui card.',
    clips: 'clipuri',
    folders: 'foldere',
    moveTo: 'Mută în',
    root: 'Fără folder',
    brand: 'Brand kit',
    brandTitle: 'Brand kit pentru proiect',
    brandDescription:
      'Setările aparțin doar proiectului selectat și nu schimbă brandul global.',
    kitName: 'Nume brand',
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
    title: 'Projects',
    description:
      'Clips, folders and campaign identity in one focused workspace.',
    newProject: 'New project',
    projects: 'Your projects',
    allClips: 'All clips',
    newFolder: 'New folder',
    folderName: 'Folder name',
    createFolder: 'Create folder',
    search: 'Search clips in this project…',
    emptyFolder: 'This folder is empty',
    emptyHint: 'Move clips here from each card menu.',
    clips: 'clips',
    folders: 'folders',
    moveTo: 'Move to',
    root: 'Unfiled',
    brand: 'Brand kit',
    brandTitle: 'Project brand kit',
    brandDescription:
      'These settings belong to this project only and do not change the workspace brand.',
    kitName: 'Brand name',
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
  const [search, setSearch] = useState('')
  const [folderDialog, setFolderDialog] = useState(false)
  const [folderName, setFolderName] = useState('')
  const [brandDialog, setBrandDialog] = useState(false)
  const [brand, setBrand] = useState<Required<ProjectBrand>>(brandDefaults)
  const [saving, setSaving] = useState(false)
  const projects = useMemo(() => data?.projects ?? [], [data])
  const project = projects.find((item) => item.id === projectId) ?? projects[0]

  useEffect(() => {
    if (projects.length && !projects.some((item) => item.id === projectId)) {
      setProjectId(projects[0]?.id ?? null)
      setFolderId('all')
    }
  }, [projectId, projects])

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
  async function createFolder() {
    if (!project || !folderName.trim()) return
    const done = await mutate(`/api/projects/${project.id}/folders`, {
      method: 'POST',
      body: JSON.stringify({
        name: folderName,
        parentId: folderId === 'all' ? null : folderId
      })
    })
    if (done) {
      setFolderDialog(false)
      setFolderName('')
      toast.add('success', text.saved)
    }
  }
  async function moveClip(clipId: string, destination: string | null) {
    if (!project) return
    const done = await mutate(`/api/projects/${project.id}/clips/${clipId}`, {
      method: 'PATCH',
      body: JSON.stringify({ folderId: destination })
    })
    if (done) toast.add('success', text.saved)
  }
  function openBrand() {
    if (!project) return
    setBrand({ ...brandDefaults, ...project.brandKit })
    setBrandDialog(true)
  }
  async function saveBrand() {
    if (!project) return
    const done = await mutate(`/api/projects/${project.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ brandKit: brand })
    })
    if (done) {
      setBrandDialog(false)
      toast.add('success', text.saved)
    }
  }
  function selectProject(id: string) {
    setProjectId(id)
    setFolderId('all')
    setSearch('')
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
      {project ? (
        <ProjectsWorkspace
          projects={projects}
          project={project}
          folderId={folderId}
          search={search}
          text={text}
          onProject={selectProject}
          onFolder={setFolderId}
          onSearch={setSearch}
          onBrand={openBrand}
          onNewFolder={() => setFolderDialog(true)}
          onMoveClip={moveClip}
        />
      ) : (
        <EmptyProjects text={text} />
      )}
      <FolderEditor
        open={folderDialog}
        project={project}
        folderId={folderId}
        name={folderName}
        saving={saving}
        text={text}
        onOpen={setFolderDialog}
        onName={setFolderName}
        onSubmit={createFolder}
      />
      <BrandEditor
        open={brandDialog}
        project={project}
        brand={brand}
        saving={saving}
        text={text}
        onOpen={setBrandDialog}
        onBrand={setBrand}
        onSubmit={saveBrand}
      />
    </div>
  )
}

type WorkspaceProps = {
  projects: Project[]
  project: Project
  folderId: string | null | 'all'
  search: string
  text: Copy
  onProject: (id: string) => void
  onFolder: (id: string | null | 'all') => void
  onSearch: (value: string) => void
  onBrand: () => void
  onNewFolder: () => void
  onMoveClip: (clipId: string, folderId: string | null) => void
}
function ProjectsWorkspace(props: WorkspaceProps) {
  return (
    <div className="projects-layout">
      <ProjectRail
        projects={props.projects}
        activeId={props.project.id}
        text={props.text}
        onSelect={props.onProject}
      />
      <ProjectBrowser {...props} />
    </div>
  )
}

function ProjectRail({
  projects,
  activeId,
  text,
  onSelect
}: {
  projects: Project[]
  activeId: string
  text: Copy
  onSelect: (id: string) => void
}) {
  return (
    <aside className="projects-rail" aria-label={text.projects}>
      <div className="projects-rail-heading">
        <span>{text.projects}</span>
        <Badge variant="secondary">{projects.length}</Badge>
      </div>
      <div className="projects-rail-list">
        {projects.map((project) => (
          <button
            key={project.id}
            type="button"
            className="projects-rail-item"
            data-active={project.id === activeId}
            onClick={() => onSelect(project.id)}
          >
            <span
              className="projects-rail-mark"
              style={{
                backgroundColor:
                  project.brandKit.primaryColor ?? brandDefaults.primaryColor
              }}
            />
            <span className="min-w-0 flex-1">
              <strong>{project.name}</strong>
              <small>
                {project.clips.length} {text.clips}
              </small>
            </span>
            <ChevronRight aria-hidden="true" />
          </button>
        ))}
      </div>
    </aside>
  )
}

function ProjectBrowser({
  project,
  folderId,
  search,
  text,
  onFolder,
  onSearch,
  onBrand,
  onNewFolder,
  onMoveClip
}: WorkspaceProps) {
  const locale = useLocale()
  const currentFolder = project.folders.find((item) => item.id === folderId)
  const folders = project.folders.filter((item) =>
    folderId === 'all' ? item.parentId === null : item.parentId === folderId
  )
  const query = search.trim().toLocaleLowerCase(locale)
  const clips = project.clips.filter(
    (clip) =>
      (folderId === 'all' || clip.folderId === folderId) &&
      (!query || clip.title.toLocaleLowerCase(locale).includes(query))
  )
  return (
    <section className="projects-browser">
      <ProjectHeader
        project={project}
        text={text}
        onBrand={onBrand}
        onNewFolder={onNewFolder}
      />
      <div className="projects-toolbar">
        <nav className="projects-breadcrumb" aria-label="Breadcrumb">
          <button type="button" onClick={() => onFolder('all')}>
            <Grid2X2 aria-hidden="true" />
            {text.allClips}
          </button>
          {currentFolder && (
            <>
              <ChevronRight aria-hidden="true" />
              <button type="button" aria-current="page">
                {currentFolder.name}
              </button>
            </>
          )}
        </nav>
        <label className="projects-search">
          <Search aria-hidden="true" />
          <Input
            type="search"
            value={search}
            onChange={(event) => onSearch(event.target.value)}
            placeholder={text.search}
          />
        </label>
      </div>
      {folders.length > 0 && (
        <FolderGrid
          folders={folders}
          clips={project.clips}
          text={text}
          onFolder={onFolder}
        />
      )}
      {clips.length > 0 ? (
        <div className="projects-clip-grid">
          {clips.map((clip) => (
            <ClipCard
              key={clip.id}
              clip={clip}
              folders={project.folders}
              text={text}
              onMove={onMoveClip}
            />
          ))}
        </div>
      ) : (
        <div className="projects-empty">
          {search ? (
            <Search aria-hidden="true" />
          ) : (
            <FolderOpen aria-hidden="true" />
          )}
          <h3>{search ? text.noResults : text.emptyFolder}</h3>
          {!search && <p>{text.emptyHint}</p>}
        </div>
      )}
    </section>
  )
}

function ProjectHeader({
  project,
  text,
  onBrand,
  onNewFolder
}: {
  project: Project
  text: Copy
  onBrand: () => void
  onNewFolder: () => void
}) {
  return (
    <header className="projects-browser-header">
      <div className="min-w-0">
        <div className="projects-kicker">
          <span className="projects-status-dot" data-status={project.status} />
          {project.status}
        </div>
        <h2>{project.name}</h2>
        <p>
          {project.clips.length} {text.clips} · {project.folders.length}{' '}
          {text.folders}
        </p>
      </div>
      <div className="projects-header-actions">
        <Button variant="outline" onClick={onBrand}>
          <Palette aria-hidden="true" />
          {text.brand}
          <span
            className="projects-brand-dot"
            style={{
              backgroundColor:
                project.brandKit.primaryColor ?? brandDefaults.primaryColor
            }}
          />
        </Button>
        <Button variant="outline" onClick={onNewFolder}>
          <FolderOpen aria-hidden="true" />
          {text.newFolder}
        </Button>
      </div>
    </header>
  )
}

function FolderGrid({
  folders,
  clips,
  text,
  onFolder
}: {
  folders: ProjectFolder[]
  clips: ProjectClip[]
  text: Copy
  onFolder: (id: string) => void
}) {
  return (
    <div className="projects-folder-grid">
      {folders.map((folder) => (
        <button
          type="button"
          key={folder.id}
          className="projects-folder"
          onClick={() => onFolder(folder.id)}
        >
          <span className="projects-folder-icon">
            <Folder aria-hidden="true" />
          </span>
          <span>
            <strong>{folder.name}</strong>
            <small>
              {clips.filter((clip) => clip.folderId === folder.id).length}{' '}
              {text.clips}
            </small>
          </span>
          <ChevronRight aria-hidden="true" />
        </button>
      ))}
    </div>
  )
}

function ClipCard({
  clip,
  folders,
  text,
  onMove
}: {
  clip: ProjectClip
  folders: ProjectFolder[]
  text: Copy
  onMove: (clipId: string, folderId: string | null) => void
}) {
  return (
    <article className="projects-clip-card">
      <Link
        href={`/dashboard/clips/${clip.id}`}
        className="projects-clip-preview"
      >
        {clip.thumbnailUrl ? (
          <Image
            src={clip.thumbnailUrl}
            alt=""
            fill={true}
            sizes="(max-width: 720px) 100vw, (max-width: 1100px) 50vw, 33vw"
          />
        ) : (
          <div className="projects-clip-placeholder">
            <Play aria-hidden="true" />
          </div>
        )}
        <span>{formatDuration(clip.duration)}</span>
      </Link>
      <div className="projects-clip-copy">
        <div>
          <h3>{clip.title}</h3>
          <p>
            {clip.aspectRatio}
            {clip.viralScore !== null && ` · ${clip.viralScore}/10`}
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild={true}>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`${text.moveTo}: ${clip.title}`}
            >
              <MoreHorizontal aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => onMove(clip.id, null)}>
              <Grid2X2 aria-hidden="true" />
              {text.root}
            </DropdownMenuItem>
            {folders.length > 0 && <DropdownMenuSeparator />}
            {folders.map((folder) => (
              <DropdownMenuItem
                key={folder.id}
                onSelect={() => onMove(clip.id, folder.id)}
              >
                <Folder aria-hidden="true" />
                {folder.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </article>
  )
}

function FolderEditor({
  open,
  project,
  folderId,
  name,
  saving,
  text,
  onOpen,
  onName,
  onSubmit
}: {
  open: boolean
  project?: Project
  folderId: string | null | 'all'
  name: string
  saving: boolean
  text: Copy
  onOpen: (open: boolean) => void
  onName: (name: string) => void
  onSubmit: () => void
}) {
  const folder = project?.folders.find((item) => item.id === folderId)
  return (
    <Dialog open={open} onOpenChange={onOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{text.newFolder}</DialogTitle>
          <DialogDescription>
            {project?.name} · {folder?.name ?? text.allClips}
          </DialogDescription>
        </DialogHeader>
        <div>
          <Label htmlFor="project-folder-name">{text.folderName}</Label>
          <Input
            id="project-folder-name"
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
            {text.createFolder}
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
  onSubmit
}: {
  open: boolean
  project?: Project
  brand: Required<ProjectBrand>
  saving: boolean
  text: Copy
  onOpen: (open: boolean) => void
  onBrand: (brand: Required<ProjectBrand>) => void
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
      <Sparkles aria-hidden="true" />
      <h2>{text.noProjects}</h2>
      <Button asChild={true}>
        <Link href="/dashboard/create">{text.newProject}</Link>
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
function formatDuration(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`
}
