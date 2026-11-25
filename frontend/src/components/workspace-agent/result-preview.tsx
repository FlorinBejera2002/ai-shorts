import { useState } from 'react'
import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { storyRequest } from '@/components/story/api'
import type { StoryProject } from '@/components/story/types'
import type { AgentAction, AgentRun } from './model'
import { AgentPill } from './agent-pill'

const previewActions = new Set(['stories.generate', 'stories.revise', 'stories.restyle', 'clips.trim', 'clips.recut', 'clips.style', 'clips.transitions', 'clips.export', 'clips.get'])

type Receipt = { action: AgentAction; result?: AgentRun['result'] }
type Preview = { url: string; transcript: string }

function mediaUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null
  try {
    const url = new URL(value, window.location.origin)
    return url.protocol === 'https:' || (url.protocol === 'http:' && url.origin === window.location.origin) ? url.href : null
  } catch { return null }
}

/** The preview-capable action: this run's own action, or its latest preview-capable step. */
function previewReceipt(run: AgentRun): Receipt | undefined {
  if (run.action && previewActions.has(run.action.name)) return { action: run.action, result: run.result }
  return [...(run.steps ?? [])].reverse().find(step => previewActions.has(step.action.name))
}

async function loadStoryPreview(receipt: Receipt | undefined, id: string, ro: boolean, signal: AbortSignal): Promise<Preview> {
  const current = await storyRequest<StoryProject>(`/api/stories/${id}`, 'GET', undefined, signal)
  const expected = receipt?.result?.data?.current_version
  const version = current.versions.find(item => item.number === expected && item.accepted)
  if (current.current_version !== expected || !version?.preview_url) throw new Error(ro ? 'Rezultatul s-a schimbat. Deschide proiectul pentru versiunea curentă.' : 'The result changed. Open the project for its current version.')
  const url = mediaUrl(version.preview_url)
  if (!url) throw new Error(ro ? 'Previzualizarea nu este disponibilă.' : 'Preview is unavailable.')
  return { url, transcript: '' }
}

async function loadClipPreview(id: string, ro: boolean, signal: AbortSignal): Promise<Preview> {
  const current = await storyRequest<Record<string, unknown>>(`/api/clips/${id}`, 'GET', undefined, signal)
  const url = mediaUrl(current.preview_url ?? current.previewUrl ?? current.file_url ?? current.fileUrl)
  if (!url) throw new Error(ro ? 'Previzualizarea nu este disponibilă.' : 'Preview is unavailable.')
  return { url, transcript: typeof current.transcript_text === 'string' ? current.transcript_text : '' }
}

type PreviewTarget = { receipt: Receipt | undefined; story: boolean; id: string }

/** The completed, preview-capable story or clip this run produced, or null when there is nothing to preview. */
function previewTarget(run: AgentRun): PreviewTarget | null {
  const receipt = previewReceipt(run)
  const action = receipt?.action.name ?? ''
  const story = action.startsWith('stories.')
  const clip = action.startsWith('clips.')
  const id = receipt?.result?.data?.id ?? receipt?.result?.data?.clip_id ?? receipt?.action.input.id
  if (run.status !== 'completed' || !(story || clip) || typeof id !== 'string' || !/^[a-f\d-]{36}$/i.test(id)) return null
  return { receipt, story, id }
}

export function ResultPreview({ run, ro }: { run: AgentRun; ro: boolean }) {
  const target = previewTarget(run)
  if (!target) return null
  return <PreviewSection run={run} target={target} ro={ro} />
}

function PreviewSection({ run, target, ro }: { run: AgentRun; target: PreviewTarget; ro: boolean }) {
  const [opened, setOpened] = useState(false)
  const [playbackFailed, setPlaybackFailed] = useState(false)
  const preview = useQuery({ queryKey: ['workspace-agent', 'preview', run.id, run.revision], enabled: opened,
    staleTime: 0, gcTime: 0, retry: false,
    queryFn: ({ signal }) => target.story ? loadStoryPreview(target.receipt, target.id, ro, signal) : loadClipPreview(target.id, ro, signal)
  })
  return <section className="space-y-2 rounded-[14px] border border-border bg-card p-3" aria-label={ro ? 'Previzualizare video' : 'Video preview'}>
    {!opened
      ? <AgentPill variant="secondary" onClick={() => setOpened(true)}>{ro ? 'Încarcă previzualizarea' : 'Load preview'}</AgentPill>
      : <PreviewPlayer story={target.story} preview={preview} playbackFailed={playbackFailed} ro={ro} onPlaybackFailed={() => setPlaybackFailed(true)} onRefresh={() => { setPlaybackFailed(false); void preview.refetch() }} />}
  </section>
}

function PreviewPlayer({ story, preview, playbackFailed, ro, onPlaybackFailed, onRefresh }: {
  story: boolean; preview: UseQueryResult<Preview>; playbackFailed: boolean; ro: boolean
  onPlaybackFailed: () => void; onRefresh: () => void
}) {
  const failed = preview.isError || playbackFailed
  const label = story ? (ro ? 'Versiunea acceptată' : 'Accepted version') : (ro ? 'Clipul salvat acum' : 'Current saved clip')
  return <>
    <p className="text-xs font-medium">{label}</p>
    {preview.isPending && <p role="status" className="text-xs">{ro ? 'Se încarcă…' : 'Loading…'}</p>}
    {preview.data && !failed && <video controls playsInline preload="metadata" src={preview.data.url} aria-label={ro ? 'Previzualizare rezultat' : 'Result preview'} onError={onPlaybackFailed} className="max-h-72 w-full rounded-[14px] bg-black" />}
    {preview.data?.transcript && <details className="text-xs"><summary>{ro ? 'Transcriere' : 'Transcript'}</summary><p className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap">{preview.data.transcript}</p></details>}
    {failed && <PreviewError error={preview.error} ro={ro} />}
    <AgentPill variant="ghost" disabled={preview.isFetching} onClick={onRefresh}>{ro ? 'Reîncarcă previzualizarea' : 'Refresh preview'}</AgentPill>
  </>
}

function PreviewError({ error, ro }: { error: unknown; ro: boolean }) {
  const message = error instanceof Error ? error.message : ro ? 'Linkul media a expirat sau redarea a eșuat.' : 'The media link expired or playback failed.'
  return <p role="alert" className="text-xs text-destructive">{message}</p>
}
