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
  ChevronDown,
  Film,
  Folder,
  FolderOpen,
  FolderPlus,
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
import {
  type CSSProperties,
  type DragEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react'

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
    projects: 'Proiectele mele',
    allClips: 'Toate clipurile',
    newFolder: 'Folder nou',
    folderName: 'Numele folderului',
    createFolder: 'Creează folder',
    search: 'Caută clipuri…',
    emptyFolder: 'Folderul este gol',
    emptyHint: 'Trage un clip peste un folder din stânga pentru a-l organiza.',
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
    noResults: 'Niciun clip nu corespunde căutării.',
    dropHint: 'Eliberează pentru a muta aici'
  },
  en: {
    title: 'Projects',
    description:
      'Clips, folders and campaign identity in one focused workspace.',
    newProject: 'New project',
    projects: 'My projects',
    allClips: 'All clips',
    newFolder: 'New folder',
    folderName: 'Folder name',
    createFolder: 'Create folder',
    search: 'Search clips…',
    emptyFolder: 'This folder is empty',
    emptyHint: 'Drag a clip onto a folder on the left to organize it.',
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
    noResults: 'No clips match this search.',
    dropHint: 'Drop to move here'
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

const CLIP_DRAG_TYPE = 'application/x-clip-id'

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
  const [dragOverTarget, setDragOverTarget] = useState<string | null>(null)
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
        <div className="projects-layout">
          <FolderRail
            projects={projects}
            project={project}
            folderId={folderId}
            dragOverTarget={dragOverTarget}
            text={text}
            onProject={selectProject}
            onFolder={setFolderId}
            onNewFolder={() => setFolderDialog(true)}
            onDropClip={moveClip}
            onDragOverTarget={setDragOverTarget}
          />
          <ClipBrowser
            project={project}
            folderId={folderId}
            search={search}
            text={text}
            onSearch={setSearch}
            onBrand={openBrand}
            onMoveClip={moveClip}
            onDragOverTarget={setDragOverTarget}
          />
        </div>
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

/* ─── Folder rail (left sidebar) ─── */

function FolderRail({
  projects,
  project,
  folderId,
  dragOverTarget,
  text,
  onProject,
  onFolder,
  onNewFolder,
  onDropClip,
  onDragOverTarget
}: {
  projects: Project[]
  project: Project
  folderId: string | null | 'all'
  dragOverTarget: string | null
  text: Copy
  onProject: (id: string) => void
  onFolder: (id: string | null | 'all') => void
  onNewFolder: () => void
  onDropClip: (clipId: string, folderId: string | null) => void
  onDragOverTarget: (target: string | null) => void
}) {
  const dragCounter = useRef(0)

  const handleDragOver = useCallback((e: DragEvent) => {
    if (e.dataTransfer.types.includes(CLIP_DRAG_TYPE)) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
    }
  }, [])

  const makeDragEnter = useCallback(
    (targetId: string) => (e: DragEvent) => {
      if (!e.dataTransfer.types.includes(CLIP_DRAG_TYPE)) return
      e.preventDefault()
      dragCounter.current++
      onDragOverTarget(targetId)
    },
    [onDragOverTarget]
  )

  const handleDragLeave = useCallback(
    (e: DragEvent) => {
      if (!e.dataTransfer.types.includes(CLIP_DRAG_TYPE)) return
      dragCounter.current--
      if (dragCounter.current <= 0) {
        dragCounter.current = 0
        onDragOverTarget(null)
      }
    },
    [onDragOverTarget]
  )

  const makeDrop = useCallback(
    (targetFolderId: string | null) => (e: DragEvent) => {
      e.preventDefault()
      dragCounter.current = 0
      onDragOverTarget(null)
      const clipId = e.dataTransfer.getData(CLIP_DRAG_TYPE)
      if (clipId) onDropClip(clipId, targetFolderId)
    },
    [onDropClip, onDragOverTarget]
  )

  const rootFolders = project.folders.filter((f) => f.parentId === null)

  return (
    <aside className="projects-rail" aria-label={text.projects}>
      {/* Project selector */}
      {projects.length > 1 && (
        <ProjectSelector
          projects={projects}
          activeId={project.id}
          onSelect={onProject}
        />
      )}

      <div className="projects-rail-heading">
        <span>{text.projects}</span>
        <button
          type="button"
          className="projects-rail-add"
          onClick={onNewFolder}
          title={text.newFolder}
        >
          <FolderPlus aria-hidden="true" />
        </button>
      </div>

      <div className="projects-rail-list">
        {/* "All clips" item — also a drop target for "unfiled" */}
        <button
          type="button"
          className="projects-rail-item"
          data-active={folderId === 'all'}
          data-dragover={dragOverTarget === '__all__'}
          onClick={() => onFolder('all')}
          onDragOver={handleDragOver}
          onDragEnter={makeDragEnter('__all__')}
          onDragLeave={handleDragLeave}
          onDrop={makeDrop(null)}
        >
          <span className="projects-rail-folder-icon">
            <Grid2X2 aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <strong>{text.allClips}</strong>
            <small>
              {project.clips.length} {text.clips}
            </small>
          </span>
        </button>

        {/* Folder items */}
        {rootFolders.map((folder) => {
          const count = project.clips.filter(
            (c) => c.folderId === folder.id
          ).length
          const isOver = dragOverTarget === folder.id
          return (
            <button
              key={folder.id}
              type="button"
              className="projects-rail-item"
              data-active={folderId === folder.id}
              data-dragover={isOver}
              onClick={() => onFolder(folder.id)}
              onDragOver={handleDragOver}
              onDragEnter={makeDragEnter(folder.id)}
              onDragLeave={handleDragLeave}
              onDrop={makeDrop(folder.id)}
            >
              <span className="projects-rail-folder-icon">
                <Folder aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <strong>{folder.name}</strong>
                <small>
                  {count} {text.clips}
                </small>
              </span>
              {isOver && (
                <span className="projects-rail-drop-hint">
                  {text.dropHint}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </aside>
  )
}

function ProjectSelector({
  projects,
  activeId,
  onSelect
}: {
  projects: Project[]
  activeId: string
  onSelect: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const active = projects.find((p) => p.id === activeId)
  return (
    <div className="projects-selector">
      <button
        type="button"
        className="projects-selector-trigger"
        onClick={() => setOpen(!open)}
      >
        <span
          className="projects-selector-dot"
          style={{
            backgroundColor:
              active?.brandKit.primaryColor ?? brandDefaults.primaryColor
          }}
        />
        <span className="projects-selector-name">
          {active?.name ?? 'Project'}
        </span>
        <ChevronDown aria-hidden="true" />
      </button>
      {open && (
        <div className="projects-selector-menu">
          {projects.map((p) => (
            <button
              key={p.id}
              type="button"
              className="projects-selector-option"
              data-active={p.id === activeId}
              onClick={() => {
                onSelect(p.id)
                setOpen(false)
              }}
            >
              <span
                className="projects-selector-dot"
                style={{
                  backgroundColor:
                    p.brandKit.primaryColor ?? brandDefaults.primaryColor
                }}
              />
              {p.name}
              <Badge variant="secondary" className="ml-auto">
                {p.clips.length}
              </Badge>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/* ─── Clip browser (right panel) ─── */

function ClipBrowser({
  project,
  folderId,
  search,
  text,
  onSearch,
  onBrand,
  onMoveClip,
  onDragOverTarget
}: {
  project: Project
  folderId: string | null | 'all'
  search: string
  text: Copy
  onSearch: (value: string) => void
  onBrand: () => void
  onMoveClip: (clipId: string, folderId: string | null) => void
  onDragOverTarget: (target: string | null) => void
}) {
  const locale = useLocale()
  const query = search.trim().toLocaleLowerCase(locale)
  const clips = project.clips.filter(
    (clip) =>
      (folderId === 'all' || clip.folderId === folderId) &&
      (!query || clip.title.toLocaleLowerCase(locale).includes(query))
  )
  const activeFolder = project.folders.find((f) => f.id === folderId)
  const brandColor =
    project.brandKit.primaryColor ?? brandDefaults.primaryColor

  return (
    <section className="projects-browser">
      <header
        className="projects-browser-header"
        style={{ '--project-accent': brandColor } as CSSProperties}
      >
        <div className="projects-browser-header-left">
          <h2>{activeFolder?.name ?? text.allClips}</h2>
          <div className="projects-header-stats">
            <span>
              <Film aria-hidden="true" />
              {clips.length} {text.clips}
            </span>
          </div>
        </div>
        <div className="projects-header-actions">
          <label className="projects-search">
            <Search aria-hidden="true" />
            <Input
              type="search"
              value={search}
              onChange={(event) => onSearch(event.target.value)}
              placeholder={text.search}
            />
          </label>
          <Button variant="outline" size="sm" onClick={onBrand}>
            <Palette aria-hidden="true" />
            {text.brand}
            <span
              className="projects-brand-dot"
              style={{ backgroundColor: brandColor }}
            />
          </Button>
        </div>
      </header>

      {clips.length > 0 ? (
        <div className="projects-clip-grid">
          {clips.map((clip, index) => (
            <ClipCard
              key={clip.id}
              clip={clip}
              index={index}
              folders={project.folders}
              text={text}
              onMove={onMoveClip}
              onDragOverTarget={onDragOverTarget}
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

/* ─── Clip card (draggable) ─── */

function ClipCard({
  clip,
  folders,
  text,
  onMove,
  onDragOverTarget,
  index
}: {
  clip: ProjectClip
  folders: ProjectFolder[]
  text: Copy
  onMove: (clipId: string, folderId: string | null) => void
  onDragOverTarget: (target: string | null) => void
  index: number
}) {
  const scoreLevel =
    clip.viralScore === null
      ? null
      : clip.viralScore >= 7
        ? 'high'
        : clip.viralScore >= 4
          ? 'mid'
          : 'low'

  const handleDragStart = useCallback(
    (e: DragEvent) => {
      e.dataTransfer.setData(CLIP_DRAG_TYPE, clip.id)
      e.dataTransfer.effectAllowed = 'move'
      const target = e.currentTarget as HTMLElement
      target.dataset.dragging = 'true'
    },
    [clip.id]
  )

  const handleDragEnd = useCallback(
    (e: DragEvent) => {
      const target = e.currentTarget as HTMLElement
      delete target.dataset.dragging
      onDragOverTarget(null)
    },
    [onDragOverTarget]
  )

  return (
    <article
      className="projects-clip-card"
      style={{ '--clip-index': index } as CSSProperties}
      draggable={true}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <Link
        href={`/dashboard/clips/${clip.id}`}
        className="projects-clip-preview"
        draggable={false}
      >
        {clip.thumbnailUrl ? (
          <Image
            src={clip.thumbnailUrl}
            alt=""
            fill={true}
            sizes="(max-width: 720px) 100vw, (max-width: 1100px) 50vw, 33vw"
            draggable={false}
          />
        ) : (
          <div className="projects-clip-placeholder">
            <Play aria-hidden="true" />
          </div>
        )}
        <span className="projects-clip-play">
          <Play aria-hidden="true" />
        </span>
        <span className="projects-clip-duration">
          {formatDuration(clip.duration)}
        </span>
        {scoreLevel && (
          <span className="projects-clip-score" data-level={scoreLevel}>
            {clip.viralScore}
          </span>
        )}
      </Link>
      <div className="projects-clip-copy">
        <div>
          <h3>{clip.title}</h3>
          <p>{clip.aspectRatio}</p>
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

/* ─── Dialogs ─── */

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

/* ─── Small pieces ─── */

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
function formatDuration(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`
}
