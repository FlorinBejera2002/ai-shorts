import { useCallback, useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, RefreshCw } from 'lucide-react'
import { useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { authClient } from '@/lib/auth'
import { storyRequest } from './api'
import {
  defaultLimits,
  defaultOptions,
  storyIsBusy,
  type StoryAsset,
  type StoryBlock,
  type StoryOptions,
  type StoryProject
} from './types'
import { StoryEditor } from './story-editor'
import { StoryOptionsPanel } from './story-options'
import { StorySources } from './story-sources'
import { StoryNarration } from './story-narration'
import { useStoryLanguage } from './use-story-language'
import { useStoryUploads } from './use-story-uploads'
import './story.css'

function savedProject(key: string) {
  try {
    return localStorage.getItem(key) ?? ''
  } catch {
    return ''
  }
}

function rememberProject(key: string, id: string) {
  try {
    if (id) localStorage.setItem(key, id)
    else localStorage.removeItem(key)
  } catch {
    /* Storage may be disabled. The project remains on the server. */
  }
}

function validateFiles(
  files: File[],
  assets: StoryAsset[],
  pending: File[],
  limits: StoryProject['limits']
) {
  if (!files.length) return ''
  if (assets.length + pending.length + files.length > limits.max_files)
    return `Maximum ${limits.max_files} files per story.`
  const invalid = files.find(
    (file) =>
      !/\.(mp4|mov|webm|mkv)$/i.test(file.name) ||
      file.size === 0 ||
      file.size > limits.max_file_bytes
  )
  if (invalid)
    return `${invalid.name}: unsupported format, empty file, or file size exceeds the limit.`
  const bytes =
    assets.reduce((sum, asset) => sum + asset.size, 0) +
    [...pending, ...files].reduce((sum, file) => sum + file.size, 0)
  return bytes > limits.max_total_bytes
    ? 'The selected files exceed the total size limit.'
    : ''
}

export function StoryBuilder() {
  const text = useStoryLanguage()
  const queryClient = useQueryClient()
  const params = useSearchParams()
  const userID = authClient.getSnapshot().user?.id ?? ''
  const storageKey = `sneepcut:story:${userID}`
  const [id, setID] = useState(() => params.get('story') || savedProject(storageKey))
  const [options, setOptions] = useState(defaultOptions)
  const [incoming, setIncoming] = useState<{ id: string; files: File[] } | null>(null)
  const [creating, setCreating] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const createID = useRef(crypto.randomUUID())
  const createBusy = useRef(false)
  const [retainedFiles, setRetainedFiles] = useState<File[]>([])
  const queryKey = ['story', userID, id]
  const projectQuery = useQuery({
    queryKey,
    enabled: Boolean(id),
    queryFn: ({ signal }) =>
      storyRequest<StoryProject>(`/api/stories/${id}`, 'GET', undefined, signal),
    refetchInterval: (query) => (storyIsBusy(query.state.data?.status) ? 2500 : false),
    retry: 1
  })
  const recent = useQuery({
    queryKey: ['stories', userID],
    queryFn: ({ signal }) =>
      storyRequest<
        StoryProject[] | { stories: StoryProject[]; limits?: StoryProject['limits'] }
      >('/api/stories', 'GET', undefined, signal)
  })
  const projects = Array.isArray(recent.data)
    ? recent.data
    : (recent.data?.stories ?? [])
  const limits = (!Array.isArray(recent.data) && recent.data?.limits) || defaultLimits
  const refresh = useCallback(
    async (project?: StoryProject) => {
      if (project?.id === id) queryClient.setQueryData(['story', userID, id], project)
      await queryClient.invalidateQueries({ queryKey: ['story', userID, id] })
      await queryClient.invalidateQueries({ queryKey: ['stories', userID] })
    },
    [queryClient, userID, id]
  )

  function selectProject(value: string) {
    setID(value)
    rememberProject(storageKey, value)
    setIncoming(null)
    setError('')
    setOptions(defaultOptions)
    setRetainedFiles([])
    createID.current = crypto.randomUUID()
  }

  async function createProject(files: File[], nextOptions: StoryOptions = options) {
    if (createBusy.current) return
    const validation = validateFiles(files, [], [], limits)
    if (validation) {
      setError(validation)
      return
    }
    setRetainedFiles(files)
    createBusy.current = true
    setCreating(true)
    setError('')
    try {
      const project = await storyRequest<StoryProject>('/api/stories', 'POST', {
        id: createID.current,
        options: nextOptions
      })
      queryClient.setQueryData(['story', userID, project.id], project)
      setIncoming({ id: project.id, files })
      setID(project.id)
      rememberProject(storageKey, project.id)
      void queryClient.invalidateQueries({ queryKey: ['stories', userID] })
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : text('Could not create project.', 'Proiectul nu a putut fi creat.')
      )
    } finally {
      createBusy.current = false
      setCreating(false)
    }
  }

  const switchingDisabled =
    creating || uploading || storyIsBusy(projectQuery.data?.status)
  return (
    <div className="story-workspace mt-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Multi-Clip Story Builder</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {text(
              'Multiple recordings. One coherent story.',
              'Mai multe filmări. O singură poveste coerentă.'
            )}
          </p>
        </div>
        <div className="flex min-w-0 flex-wrap gap-2">
          {projects.length > 0 && (
            <select
              className="story-select max-w-64"
              aria-label={text('Open story project', 'Deschide proiectul')}
              value={id}
              disabled={switchingDisabled}
              onChange={(event) => selectProject(event.target.value)}
            >
              <option value="">{text('New story', 'Poveste nouă')}</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.options?.brief?.slice(0, 40) ||
                    project.assets?.[0]?.name ||
                    project.id.slice(0, 8)}{' '}
                  · {project.status}
                </option>
              ))}
            </select>
          )}
          {id && (
            <Button
              variant="outline"
              disabled={switchingDisabled}
              onClick={() => selectProject('')}
            >
              <Plus />
              {text('New story', 'Poveste nouă')}
            </Button>
          )}
        </div>
      </div>
      {error && (
        <div
          role="alert"
          className="space-y-2 rounded-md border p-3 text-sm text-destructive"
        >
          <p>{error}</p>
          {retainedFiles.length > 0 && (
            <Button
              variant="outline"
              disabled={creating}
              onClick={() => void createProject(retainedFiles)}
            >
              {text('Retry creating project', 'Reîncearcă crearea proiectului')}
            </Button>
          )}
        </div>
      )}
      {!id ? (
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <StorySources
            assets={[]}
            uploads={[]}
            limits={limits}
            disabled={creating}
            onAdd={(files) => void createProject(files)}
            onRemove={() => {}}
            onRetry={() => {}}
            onDuration={() => {}}
            onChange={() => {}}
          />
          <StoryOptionsPanel
            options={options}
            disabled={creating}
            onChange={(value) => {
              setOptions(value)
              if (value.narration) void createProject([], value)
            }}
          />
          {creating && (
            <p role="status" className="text-sm">
              {text('Creating your project…', 'Se creează proiectul…')}
            </p>
          )}
        </div>
      ) : projectQuery.data ? (
        <StoryWorkspace
          key={id}
          project={projectQuery.data}
          initialFiles={incoming?.id === id ? incoming.files : []}
          refresh={refresh}
          onUploadBusy={setUploading}
          onDeleted={() => {
            selectProject('')
            void queryClient.invalidateQueries({ queryKey: ['stories', userID] })
          }}
        />
      ) : projectQuery.isError ? (
        <Card className="block space-y-3 p-5">
          <p role="alert">{projectQuery.error.message}</p>
          <Button variant="outline" onClick={() => void projectQuery.refetch()}>
            <RefreshCw />
            {text('Retry', 'Reîncearcă')}
          </Button>
        </Card>
      ) : (
        <p role="status" className="py-10 text-sm text-muted-foreground">
          {text('Loading your story…', 'Se încarcă povestea…')}
        </p>
      )}
    </div>
  )
}

interface WorkspaceProps {
  project: StoryProject
  initialFiles: File[]
  refresh: (project?: StoryProject) => Promise<unknown>
  onUploadBusy: (busy: boolean) => void
  onDeleted: () => void
}

function StoryWorkspace({
  project,
  initialFiles,
  refresh,
  onUploadBusy,
  onDeleted
}: WorkspaceProps) {
  const text = useStoryLanguage()
  const uploads = useStoryUploads(project.id, refresh)
  const { add } = uploads
  const [options, setOptions] = useState(project.options)
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [narrationPending, setNarrationPending] = useState(false)
  const seeded = useRef(false)
  const mutation = useRef(false)
  const requests = useRef(new Map<string, string>())
  const active = storyIsBusy(project.status)
  const assets = project.assets ?? []
  const narration = assets.find((asset) => asset.kind === 'narration')
  const videos = assets.filter((asset) => asset.kind !== 'narration')
  const mediaPending = uploads.busy || narrationPending
  const sourceIDs = new Set(assets.map((asset) => asset.id))
  const pending = uploads.items.filter(
    (item) => !sourceIDs.has(item.id) && item.status !== 'complete'
  )
  const version = project.versions?.find(
    (item) => item.number === project.current_version
  )
  const canEditSources = project.status === 'draft' && !busy
  const limits = project.limits ?? defaultLimits
  const onNarrationPending = useCallback((value: boolean) => {
    setNarrationPending(value)
    if (value) setConfirmed(false)
  }, [])

  useEffect(() => {
    if (!seeded.current && initialFiles.length > 0) {
      seeded.current = true
      add(initialFiles)
    }
  }, [initialFiles, add])
  useEffect(() => {
    onUploadBusy(mediaPending)
    return () => onUploadBusy(false)
  }, [mediaPending, onUploadBusy])
  useEffect(() => {
    if (!mediaPending) return
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [mediaPending])

  async function mutate(
    path: string,
    method: string,
    payload?: Record<string, unknown>
  ) {
    if (mutation.current) return
    mutation.current = true
    setBusy(true)
    setError('')
    try {
      const signature = JSON.stringify({ path, payload })
      const idempotent = ['/generate', '/retry', '/rollback'].includes(path)
      let requestID = requests.current.get(signature)
      if (idempotent && !requestID) {
        requestID = crypto.randomUUID()
        requests.current.set(signature, requestID)
      }
      const updated = await storyRequest<StoryProject>(
        `/api/stories/${project.id}${path}`,
        method,
        idempotent ? { ...payload, request_id: requestID } : payload
      )
      requests.current.delete(signature)
      if (method !== 'DELETE' || path !== '') await refresh(updated)
      return true
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : text('The action failed. Try again.', 'Acțiunea a eșuat. Încearcă din nou.')
      )
      return false
    } finally {
      mutation.current = false
      setBusy(false)
    }
  }

  function addFiles(files: File[]) {
    const validation = validateFiles(
      files,
      videos,
      pending.map((item) => item.file),
      limits
    )
    if (validation) {
      setError(validation)
      return
    }
    setConfirmed(false)
    setError('')
    uploads.add(files, Math.max(-1, ...assets.map((asset) => asset.order)) + 1)
  }

  async function removeAsset(id: string) {
    setConfirmed(false)
    if (sourceIDs.has(id)) {
      if (await mutate(`/assets/${id}`, 'DELETE')) uploads.forget(id)
    } else uploads.forget(id)
  }

  function changeAsset(id: string, patch: Partial<StoryAsset>) {
    const ordered = [...assets].sort((a, b) => a.order - b.order)
    if (patch.order !== undefined) {
      const index = ordered.findIndex((asset) => asset.id === id)
      const [moved] = ordered.splice(index, 1)
      if (moved) ordered.splice(patch.order, 0, moved)
    }
    setConfirmed(false)
    void mutate('', 'PATCH', {
      assets: ordered.map((asset, index) => ({
        id: asset.id,
        role: asset.id === id ? (patch.role ?? asset.role) : asset.role,
        include: asset.id === id ? (patch.include ?? asset.include) : asset.include,
        order: index
      }))
    })
  }

  async function generate() {
    if (
      !confirmed ||
      pending.length > 0 ||
      mediaPending ||
      !videos.length ||
      (options.narration && !narration)
    )
      return
    if (project.status === 'draft' && !(await mutate('', 'PATCH', { options }))) return
    await mutate('/generate', 'POST', { asset_ids: assets.map((asset) => asset.id) })
  }

  function edit(action: string, blockID?: string, candidateID?: string) {
    void mutate('/generate', 'POST', {
      action,
      version: version?.number,
      ...(blockID ? { block_id: blockID } : {}),
      ...(candidateID ? { candidate_id: candidateID } : {})
    })
  }

  function lock(block: StoryBlock, patch: Partial<StoryBlock>) {
    const locks = (version?.plan.blocks ?? []).map((current) => {
      const changed = current.id === block.id ? { ...current, ...patch } : current
      return {
        block_id: changed.id,
        locked: changed.locked,
        lock_text: changed.lock_text,
        lock_order: changed.lock_order,
        lock_crop: changed.lock_crop
      }
    })
    void mutate('', 'PATCH', { version: version?.number, locks })
  }

  const statuses: Record<string, string> = {
    draft: text('Add your recordings', 'Adaugă filmările'),
    pending: text('Queued', 'În așteptare'),
    analyzing: text('Analyzing recordings', 'Se analizează filmările'),
    building_story: text('Building your story', 'Se construiește povestea'),
    editing: text('Editing', 'Se montează'),
    reviewing: text('Reviewing the actual edit', 'Se verifică montajul'),
    improving: text('Improving the edit', 'Se îmbunătățește montajul'),
    ready: text('Ready', 'Pregătit'),
    needs_review: text('Needs review', 'Necesită revizie'),
    failed: text('Failed', 'Eșuat'),
    cancelled: text('Cancelled', 'Anulat')
  }
  return (
    <div className="space-y-5">
      {project.status !== 'draft' && (
        <Card className="block space-y-2 p-4" role="status" aria-live="polite">
          <p className="font-medium">{statuses[project.status] ?? project.status}</p>
          <p className="text-sm text-muted-foreground">{project.message}</p>
          {project.error && <p className="text-sm text-destructive">{project.error}</p>}
          {active && (
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => void mutate('/cancel', 'POST', {})}
            >
              {text('Cancel processing', 'Anulează procesarea')}
            </Button>
          )}
        </Card>
      )}
      {error && (
        <p role="alert" className="rounded-md border p-3 text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-5">
          {version && (
            <StoryEditor
              project={project}
              version={version}
              disabled={active || busy}
              onAction={edit}
              onLock={lock}
              onRollback={(number) =>
                void mutate('/rollback', 'POST', { version: number })
              }
            />
          )}
          {(options.narration || narration) && (
            <StoryNarration
              projectID={project.id}
              asset={narration}
              disabled={!canEditSources}
              onSaved={refresh}
              onPending={onNarrationPending}
              onRemove={(assetID) => void removeAsset(assetID)}
            />
          )}
          <StorySources
            assets={videos}
            narration={options.narration}
            uploads={uploads.items}
            limits={limits}
            disabled={!canEditSources || narrationPending}
            onAdd={addFiles}
            onRemove={(id) => void removeAsset(id)}
            onRetry={uploads.retry}
            onDuration={(id, duration) => uploads.update(id, { duration })}
            onChange={changeAsset}
          />
        </div>
        <div className="space-y-5">
          <StoryOptionsPanel
            options={options}
            hasNarration={Boolean(narration)}
            disabled={!canEditSources || narrationPending}
            onChange={(value) => {
              setConfirmed(false)
              if (Boolean(value.narration) !== Boolean(options.narration)) {
                void mutate('', 'PATCH', { options: value }).then((saved) => {
                  if (saved) setOptions(value)
                })
              } else setOptions(value)
            }}
          />
          {!version && !active && (
            <Card className="block space-y-4 p-5">
              <h2 className="font-semibold">
                {text('Build one story', 'Creează o poveste')}
              </h2>
              <p className="text-sm text-muted-foreground">
                {text(
                  '10 credits once, including automatic review and repairs. Original recordings remain available.',
                  '10 credite o singură dată, inclusiv revizie și reparații automate. Filmările originale rămân disponibile.'
                )}
              </p>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1 accent-foreground"
                  checked={confirmed}
                  disabled={
                    pending.length > 0 ||
                    mediaPending ||
                    videos.length === 0 ||
                    busy ||
                    Boolean(options.narration && !narration)
                  }
                  onChange={(event) => setConfirmed(event.target.checked)}
                />
                {options.narration
                  ? text(
                      'My narration and all my clips are saved. Use this complete set.',
                      'Narațiunea și toate filmările sunt salvate. Folosește acest set complet.'
                    )
                  : text(
                      'All my clips are uploaded. Use this complete set.',
                      'Am încărcat toate filmările. Folosește acest set complet.'
                    )}
              </label>
              <Button
                className="w-full bg-foreground text-background hover:bg-foreground/90"
                disabled={
                  !confirmed ||
                  pending.length > 0 ||
                  mediaPending ||
                  !videos.length ||
                  Boolean(options.narration && !narration) ||
                  busy
                }
                onClick={() => void generate()}
              >
                {busy
                  ? text('Submitting…', 'Se trimite…')
                  : text('Build my story', 'Creează povestea')}
              </Button>
            </Card>
          )}
          {!active && (
            <div className="space-y-2">
              {deleting ? (
                <Card className="block space-y-3 p-4">
                  <p className="text-sm">
                    {text(
                      'Delete this story and its source files, previews, and saved versions?',
                      'Ștergi povestea, fișierele sursă, previzualizările și versiunile salvate?'
                    )}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="destructive"
                      disabled={busy || mediaPending}
                      onClick={async () => {
                        if (await mutate('', 'DELETE')) onDeleted()
                      }}
                    >
                      {text('Delete permanently', 'Șterge definitiv')}
                    </Button>
                    <Button
                      variant="ghost"
                      disabled={busy}
                      onClick={() => setDeleting(false)}
                    >
                      {text('Keep', 'Păstrează')}
                    </Button>
                  </div>
                </Card>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy || mediaPending}
                  onClick={() => setDeleting(true)}
                >
                  {text('Delete project', 'Șterge proiectul')}
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
