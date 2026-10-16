import { useCallback, useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { RefreshCw } from 'lucide-react'
import { useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { authClient } from '@/lib/auth'
import { StoryRequestError, storyRequest } from './api'
import {
  defaultLimits,
  defaultOptions,
  canEditStorySources,
  storyOptionsEqual,
  storyIsBusy,
  type StoryAsset,
  type StoryOptions,
  type StoryProject
} from './types'
import { StoryResult } from './story-result'
import { StoryOptionsPanel } from './story-options'
import { StorySources } from './story-sources'
import { StoryNarration } from './story-narration'
import { StoryWizard, type StoryStep } from './story-wizard'
import { StoryCreateReview } from './story-create-review'
import {
  StoryProjectDelete,
  StoryProjectHeader,
  StoryProjectStatus
} from './story-project-controls'
import { useStoryLanguage } from './use-story-language'
import { useStoryUploads } from './use-story-uploads'
import { StoryAudioComparison } from './story-audio-comparison'
import { StoryTranscriptReview } from './story-transcript-review'
import { storyProblem } from './story-error'
import { storyRetryPayload } from './story-retry'
import { validateStoryFiles } from './story-file-validation'
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

function savedStep(project: StoryProject, initialStep?: StoryStep): StoryStep {
  if (project.status !== 'draft') return 2
  if (initialStep !== undefined) return initialStep
  const saved = Number(savedProject(`sneepcut:story-step:${project.id}`))
  return saved >= 0 && saved <= 3 && Number.isInteger(saved)
    ? (Math.min(saved, 2) as StoryStep)
    : 0
}

function stepHint(
  text: (english: string, romanian: string) => string,
  step: StoryStep,
  narrationPending: boolean,
  narrationMissing: boolean,
  uploading: boolean
) {
  if (narrationPending)
    return text(
      'Save or discard your recording before moving to another step.',
      'Salvează înregistrarea sau renunță la ea înainte de a trece la alt pas.'
    )
  if (step === 1 && narrationMissing)
    return text(
      'Record or choose an audio file, then save your narration to continue.',
      'Înregistrează sau alege un fișier audio, apoi salvează narațiunea pentru a continua.'
    )
  if (uploading && step !== 0)
    return text(
      'Your clips are still uploading. You can keep working on your story.',
      'Filmările încă se încarcă. Poți continua să pregătești povestea.'
    )
}

export function StoryBuilder() {
  const text = useStoryLanguage()
  const queryClient = useQueryClient()
  const params = useSearchParams()
  const userID = authClient.getSnapshot().user?.id ?? ''
  const storageKey = `sneepcut:story:${userID}`
  const requestedID = params.get('story')
  const [previousRequestedID, setPreviousRequestedID] = useState(requestedID)
  const [id, setID] = useState(
    () => requestedID || savedProject(storageKey)
  )
  const [incoming, setIncoming] = useState<{
    id: string
    files: File[]
    step: StoryStep
  } | null>(null)
  const [creating, setCreating] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [unsavedChanges, setUnsavedChanges] = useState(false)
  const [error, setError] = useState('')
  const createID = useRef(crypto.randomUUID())
  const createBusy = useRef(false)
  const [retainedFiles, setRetainedFiles] = useState<File[]>([])
  const requestedStep = useRef<StoryStep>(0)

  useEffect(() => {
    rememberProject(storageKey, id)
    createID.current = crypto.randomUUID()
  }, [storageKey, id])

  const queryKey = ['story', userID, id]
  const projectQuery = useQuery({
    queryKey,
    enabled: Boolean(id),
    queryFn: ({ signal }) =>
      storyRequest<StoryProject>(
        `/api/stories/${id}`,
        'GET',
        undefined,
        signal
      ),
    refetchInterval: (query) =>
      storyIsBusy(query.state.data?.status) ? 2500 : false,
    retry: 1
  })
  const recent = useQuery({
    queryKey: ['stories', userID],
    queryFn: ({ signal }) =>
      storyRequest<
        | StoryProject[]
        | { stories: StoryProject[]; limits?: StoryProject['limits'] }
      >('/api/stories', 'GET', undefined, signal)
  })
  const projects = Array.isArray(recent.data)
    ? recent.data
    : (recent.data?.stories ?? [])
  const limits =
    (!Array.isArray(recent.data) && recent.data?.limits) || defaultLimits
  const refresh = useCallback(
    async (project?: StoryProject) => {
      if (project?.id === id)
        queryClient.setQueryData(['story', userID, id], project)
      await queryClient.invalidateQueries({ queryKey: ['story', userID, id] })
      await queryClient.invalidateQueries({ queryKey: ['stories', userID] })
    },
    [queryClient, userID, id]
  )

  const selectProject = useCallback((value: string) => {
    setID(value)
    setIncoming(null)
    setError('')
    setRetainedFiles([])
    createID.current = crypto.randomUUID()
  }, [])

  function createProject(files: File[], nextStep: StoryStep = 0) {
    if (createBusy.current) return
    const validation = validateStoryFiles(files, [], [], limits)
    if (validation) {
      setError(storyProblem(validation, text))
      return
    }
    setRetainedFiles(files)
    requestedStep.current = nextStep
    createBusy.current = true
    setCreating(true)
    setError('')
    return storyRequest<StoryProject>('/api/stories', 'POST', {
      id: createID.current,
      options: defaultOptions
    })
      .then((project) => {
        queryClient.setQueryData(['story', userID, project.id], project)
        setIncoming({ id: project.id, files, step: nextStep })
        setID(project.id)
        void queryClient.invalidateQueries({ queryKey: ['stories', userID] })
      })
      .catch((cause: unknown) => {
        setError(
          cause instanceof Error
            ? storyProblem(cause.message, text)
            : text('Could not create project.', 'Proiectul nu a putut fi creat.')
        )
      })
      .finally(() => {
        createBusy.current = false
        setCreating(false)
      })
  }

  const switchingDisabled =
    creating ||
    uploading ||
    unsavedChanges ||
    storyIsBusy(projectQuery.data?.status)

  // Consume a changed link once switching is safe; unchanged links must not
  // override a manual selection or the creation of a new project.
  if (requestedID !== previousRequestedID && !switchingDisabled) {
    setPreviousRequestedID(requestedID)
    if (requestedID && requestedID !== id) {
      setID(requestedID)
      setIncoming(null)
      setError('')
      setRetainedFiles([])
    }
  }

  return (
    <div className="story-workspace w-full space-y-5">
      <StoryProjectHeader
        id={id}
        projects={projects}
        hasOutput={Boolean(projectQuery.data?.current_version)}
        unsavedChanges={unsavedChanges}
        disabled={switchingDisabled}
        onSelect={selectProject}
      />
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
              onClick={() =>
                void createProject(retainedFiles, requestedStep.current)
              }
            >
              {text('Retry creating project', 'Reîncearcă crearea proiectului')}
            </Button>
          )}
        </div>
      )}
      {!id ? (
        <StoryWizard
          step={0}
          furthest={0}
          onStep={() => {}}
          onContinue={() => void createProject(retainedFiles, 1)}
          navigationDisabled={creating}
        >
          <div data-testid="story-step-0">
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
          </div>
          {creating && (
            <p role="status" className="text-sm">
              {text('Creating your project…', 'Se creează proiectul…')}
            </p>
          )}
        </StoryWizard>
      ) : projectQuery.data ? (
        <StoryWorkspace
          key={id}
          project={projectQuery.data}
          initialFiles={incoming?.id === id ? incoming.files : []}
          initialStep={incoming?.id === id ? incoming.step : undefined}
          refresh={refresh}
          onUploadBusy={setUploading}
          onUnsavedChanges={setUnsavedChanges}
          onDeleted={() => {
            selectProject('')
            void queryClient.invalidateQueries({
              queryKey: ['stories', userID]
            })
          }}
        />
      ) : projectQuery.isError ? (
        <Card className="block space-y-3 p-5">
          <p role="alert">{storyProblem(projectQuery.error.message, text)}</p>
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
  initialStep?: StoryStep
  refresh: (project?: StoryProject) => Promise<unknown>
  onUploadBusy: (busy: boolean) => void
  onUnsavedChanges: (unsaved: boolean) => void
  onDeleted: () => void
}

function StoryWorkspace({
  project,
  initialFiles,
  initialStep,
  refresh,
  onUploadBusy,
  onUnsavedChanges,
  onDeleted
}: WorkspaceProps) {
  const text = useStoryLanguage()
  const uploads = useStoryUploads(project.id, refresh)
  const { add } = uploads
  const [options, setOptions] = useState(project.options)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [narrationPending, setNarrationPending] = useState(false)
  const stepStorageKey = `sneepcut:story-step:${project.id}`
  const [step, setStep] = useState<StoryStep>(() =>
    savedStep(project, initialStep)
  )
  const [furthest, setFurthest] = useState(step)
  const seeded = useRef(false)
  const mutation = useRef(false)
  const requests = useRef(new Map<string, string>())
  const active = storyIsBusy(project.status)
  const assets = project.assets ?? []
  const narration = assets.find((asset) => asset.kind === 'narration')
  const videos = assets.filter((asset) => asset.kind !== 'narration')
  const mediaPending = uploads.busy || narrationPending
  const optionsChanged =
    canEditStorySources(project) && !storyOptionsEqual(options, project.options)
  const sourceIDs = new Set(assets.map((asset) => asset.id))
  const pending = uploads.items.filter(
    (item) => !sourceIDs.has(item.id) && item.status !== 'complete'
  )
  const version = project.versions?.find(
    (item) => item.number === project.current_version
  )
  const canEditSources = canEditStorySources(project) && !busy
  const limits = project.limits ?? defaultLimits
  const onNarrationPending = useCallback((value: boolean) => {
    setNarrationPending(value)
  }, [])

  useEffect(() => {
    if (!seeded.current && initialFiles.length > 0) {
      seeded.current = true
      add(initialFiles)
    }
  }, [initialFiles, add])
  useEffect(() => {
    onUploadBusy(mediaPending || busy)
    return () => onUploadBusy(false)
  }, [mediaPending, busy, onUploadBusy])
  useEffect(() => {
    onUnsavedChanges(optionsChanged)
    return () => onUnsavedChanges(false)
  }, [optionsChanged, onUnsavedChanges])
  useEffect(() => {
    if (!mediaPending && !optionsChanged && !busy) return
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [mediaPending, optionsChanged, busy])

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
      const idempotent = ['/generate', '/retry', '/transcript-review'].includes(path)
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
      if (cause instanceof StoryRequestError && cause.status === 409) {
        setError(
          text(
            'The project changed. Your choices are kept. Review them and apply again.',
            'Proiectul s-a schimbat. Alegerile tale sunt păstrate. Verifică-le și aplică din nou.'
          )
        )
        // Fetch the new guard/state, but keep local options and transcript drafts.
        // A rejected action is never replayed automatically against new media.
        await refresh()
      } else {
        setError(
          cause instanceof Error
            ? storyProblem(cause.message, text)
            : text(
                'The action failed. Try again.',
                'Acțiunea a eșuat. Încearcă din nou.'
              )
        )
      }
      return false
    } finally {
      mutation.current = false
      setBusy(false)
    }
  }

  function addFiles(files: File[]) {
    const validation = validateStoryFiles(
      files,
      videos,
      pending.map((item) => item.file),
      limits
    )
    if (validation) {
      setError(storyProblem(validation, text))
      return
    }

    setError('')
    uploads.add(
      files,
      assets.reduce((order, asset) => Math.max(order, asset.order), -1) + 1
    )
  }

  async function removeAsset(id: string) {
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

    void mutate('', 'PATCH', {
      assets: ordered.map((asset, index) => ({
        id: asset.id,
        role: asset.id === id ? (patch.role ?? asset.role) : asset.role,
        include:
          asset.id === id ? (patch.include ?? asset.include) : asset.include,
        order: index
      }))
    })
  }

  async function generate() {
    if (
      pending.length > 0 ||
      mediaPending ||
      !videos.some((asset) => asset.include !== 'excluded') ||
      (options.narration && !narration)
    )
      return
    if (
      canEditStorySources(project) &&
      !(await mutate('', 'PATCH', { options }))
    )
      return
    await mutate('/generate', 'POST', {
      asset_ids: assets.map((asset) => asset.id)
    })
  }

  async function continueWithOriginalAudio() {
    if (version) return
    const original = { ...options, audio_cleanup: { enabled: false } }
    if (await mutate('', 'PATCH', { options: original })) {
      setOptions(original)
      await mutate('/generate', 'POST', {
        asset_ids: assets.map((asset) => asset.id)
      })
    }
  }

  function changeOptions(value: StoryOptions) {
    if (Boolean(value.narration) !== Boolean(options.narration)) {
      void mutate('', 'PATCH', { options: value }).then((saved) => {
        if (saved) setOptions(value)
      })
    } else setOptions(value)
  }

  async function goToStep(next: StoryStep) {
    if (busy || mutation.current || narrationPending || next === step) return
    // Keep Brief and Captions reachable while an unsaved choice conflicts with
    // the prompt. Validate the combined request before entering Generate.
    if (next === 2 && optionsChanged) {
      if (!(await mutate('', 'PATCH', { options }))) return
    }
    const destination = next > 1 && options.narration && !narration ? 1 : next
    setError('')
    setStep(destination)
    setFurthest((previous) => Math.max(previous, destination) as StoryStep)
    rememberProject(stepStorageKey, String(destination))
  }

  const failedOperation =
    project.status === 'failed' ||
    project.status === 'cancelled' ||
    project.operation_status === 'failed'
  const retryPayload = failedOperation
    ? storyRetryPayload(project)
    : undefined
  const retryOperation = retryPayload
    ? () => void mutate('/retry', 'POST', retryPayload)
    : undefined

  const canCreate =
    pending.length === 0 &&
    !mediaPending &&
    videos.some((asset) => asset.include !== 'excluded') &&
    (!options.narration || Boolean(narration))
  const narrationMissing = Boolean(options.narration && !narration)
  const navigationHint = stepHint(
    text,
    step,
    narrationPending,
    narrationMissing,
    uploads.busy
  )
  const sourcesPanel = (
    <StorySources
      assets={videos}
      narration={options.narration}
      uploads={uploads.items}
      limits={limits}
      disabled={!canEditSources || narrationPending}
      onAdd={addFiles}
      onRemove={(assetID) => void removeAsset(assetID)}
      onRetry={uploads.retry}
      onDuration={(assetID, duration) => uploads.update(assetID, { duration })}
      onChange={changeAsset}
    />
  )
  const narrationPanel = (options.narration || narration) && (
    <StoryNarration
      projectID={project.id}
      asset={narration}
      disabled={!canEditSources}
      onSaved={refresh}
      onPending={onNarrationPending}
      onRemove={(assetID) => void removeAsset(assetID)}
    />
  )
  const optionsPanel = (section: 'story' | 'settings' | 'all') => (
    <StoryOptionsPanel
      section={section}
      active={step === 1}
      options={options}
      hasNarration={Boolean(narration)}
      disabled={!canEditSources || narrationPending}
      onChange={changeOptions}
    />
  )

  return (
    <div className="space-y-5">
      <StoryProjectStatus
        project={project}
        active={active}
        busy={busy}
        onRetry={retryOperation}
        onCancel={() => void mutate('/cancel', 'POST', {})}
      />
      {error && (
        <p
          role="alert"
          className="rounded-md border p-3 text-sm text-destructive"
        >
          {error}
        </p>
      )}
      {version && <StoryResult project={project} version={version} />}
      {!version && (
        <>
          <StoryTranscriptReview
            assets={assets}
            disabled={active || busy}
            onApprove={(reviews) =>
              mutate('/transcript-review', 'POST', {
                version: project.current_version,
                expected_state: project.expected_state,
                reviews
              })
            }
          />
          <StoryAudioComparison
            assets={assets}
            enabled={Boolean(project.options.audio_cleanup?.enabled)}
            disabled={active || busy}
            onOriginal={() => void continueWithOriginalAudio()}
            onRetry={retryOperation}
          />
        </>
      )}
      {!version && !active ? (
        <StoryWizard
          step={step}
          furthest={furthest}
          onStep={(next) => void goToStep(next)}
          onContinue={() => void goToStep(Math.min(step + 1, 2) as StoryStep)}
          navigationDisabled={busy || narrationPending}
          continueDisabled={step === 1 && narrationMissing}
          navigationHint={navigationHint}
        >
          <div hidden={step !== 0} data-testid="story-step-0">
            {sourcesPanel}
          </div>
          <div
            hidden={step !== 1}
            data-testid="story-step-1"
            className="story-audio-layout"
          >
            {optionsPanel('all')}
            {narrationPanel}
          </div>
          <div hidden={step !== 2} data-testid="story-step-2">
            <StoryCreateReview
              options={options}
              videos={videos}
              narration={narration}
              ready={canCreate}
              busy={busy || narrationPending}
              pendingCount={pending.length}
              onEdit={(next) => void goToStep(next)}
              onCreate={() => void generate()}
            />
          </div>
        </StoryWizard>
      ) : (
        <details className="w-full border-t">
          <summary className="cursor-pointer py-4 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground">
            {text('Original files and settings', 'Fișiere originale și setări')}
          </summary>
          <div className="space-y-6 pb-4">
            {sourcesPanel}
            {narrationPanel}
            {optionsPanel('all')}
          </div>
        </details>
      )}
      {!active && (
        <StoryProjectDelete
          disabled={busy || mediaPending}
          onDelete={async () => {
            if (await mutate('', 'DELETE')) onDeleted()
          }}
        />
      )}
    </div>
  )
}
