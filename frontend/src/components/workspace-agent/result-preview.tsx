import { useState } from 'react'
import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import type { SiteLocale } from '@/lib/site-config'
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

async function loadStoryPreview(receipt: Receipt | undefined, id: string, locale: SiteLocale, signal: AbortSignal): Promise<Preview> {
  const current = await storyRequest<StoryProject>(`/api/stories/${id}`, 'GET', undefined, signal)
  const expected = receipt?.result?.data?.current_version
  const version = current.versions.find(item => item.number === expected && item.accepted)
  if (current.current_version !== expected || !version?.preview_url) throw new Error({ en: 'The result changed. Open the project for its current version.', ro: 'Rezultatul s-a schimbat. Deschide proiectul pentru versiunea curentă.', es: 'El resultado cambió. Abre el proyecto para ver su versión actual.' }[locale])
  const url = mediaUrl(version.preview_url)
  if (!url) throw new Error(previewUnavailable(locale))
  return { url, transcript: '' }
}

async function loadClipPreview(id: string, locale: SiteLocale, signal: AbortSignal): Promise<Preview> {
  const current = await storyRequest<Record<string, unknown>>(`/api/clips/${id}`, 'GET', undefined, signal)
  const url = mediaUrl(current.preview_url ?? current.previewUrl ?? current.file_url ?? current.fileUrl)
  if (!url) throw new Error(previewUnavailable(locale))
  return { url, transcript: typeof current.transcript_text === 'string' ? current.transcript_text : '' }
}

function previewUnavailable(locale: SiteLocale) {
  return { en: 'Preview is unavailable.', ro: 'Previzualizarea nu este disponibilă.', es: 'La vista previa no está disponible.' }[locale]
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

export function ResultPreview({ run, locale }: { run: AgentRun; locale: SiteLocale }) {
  const target = previewTarget(run)
  if (!target) return null
  return <PreviewSection run={run} target={target} locale={locale} />
}

function PreviewSection({ run, target, locale }: { run: AgentRun; target: PreviewTarget; locale: SiteLocale }) {
  const [opened, setOpened] = useState(false)
  const [playbackFailed, setPlaybackFailed] = useState(false)
  const preview = useQuery({ queryKey: ['workspace-agent', 'preview', run.id, run.revision], enabled: opened,
    staleTime: 0, gcTime: 0, retry: false,
    queryFn: ({ signal }) => target.story ? loadStoryPreview(target.receipt, target.id, locale, signal) : loadClipPreview(target.id, locale, signal)
  })
  return <section className="space-y-2 rounded-[14px] border border-border bg-card p-3" aria-label={{ en: 'Video preview', ro: 'Previzualizare video', es: 'Vista previa de video' }[locale]}>
    {!opened
      ? <AgentPill variant="secondary" onClick={() => setOpened(true)}>{{ en: 'Load preview', ro: 'Încarcă previzualizarea', es: 'Cargar vista previa' }[locale]}</AgentPill>
      : <PreviewPlayer story={target.story} preview={preview} playbackFailed={playbackFailed} locale={locale} onPlaybackFailed={() => setPlaybackFailed(true)} onRefresh={() => { setPlaybackFailed(false); void preview.refetch() }} />}
  </section>
}

function PreviewPlayer({ story, preview, playbackFailed, locale, onPlaybackFailed, onRefresh }: {
  story: boolean; preview: UseQueryResult<Preview>; playbackFailed: boolean; locale: SiteLocale
  onPlaybackFailed: () => void; onRefresh: () => void
}) {
  const failed = preview.isError || playbackFailed
  const label = story
    ? { en: 'Accepted version', ro: 'Versiunea acceptată', es: 'Versión aceptada' }[locale]
    : { en: 'Current saved clip', ro: 'Clipul salvat acum', es: 'Clip guardado actualmente' }[locale]
  return <>
    <p className="text-xs font-medium">{label}</p>
    {preview.isPending && <p role="status" className="text-xs">{{ en: 'Loading…', ro: 'Se încarcă…', es: 'Cargando…' }[locale]}</p>}
    {preview.data && !failed && <video controls playsInline preload="metadata" src={preview.data.url} aria-label={{ en: 'Result preview', ro: 'Previzualizare rezultat', es: 'Vista previa del resultado' }[locale]} onError={onPlaybackFailed} className="max-h-72 w-full rounded-[14px] bg-black" />}
    {preview.data?.transcript && <details className="text-xs"><summary>{{ en: 'Transcript', ro: 'Transcriere', es: 'Transcripción' }[locale]}</summary><p className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap">{preview.data.transcript}</p></details>}
    {failed && <PreviewError error={preview.error} locale={locale} />}
    <AgentPill variant="ghost" disabled={preview.isFetching} onClick={onRefresh}>{{ en: 'Refresh preview', ro: 'Reîncarcă previzualizarea', es: 'Recargar vista previa' }[locale]}</AgentPill>
  </>
}

function PreviewError({ error, locale }: { error: unknown; locale: SiteLocale }) {
  const message = error instanceof Error ? error.message : { en: 'The media link expired or playback failed.', ro: 'Linkul media a expirat sau redarea a eșuat.', es: 'El enlace del medio caducó o la reproducción falló.' }[locale]
  return <p role="alert" className="text-xs text-destructive">{message}</p>
}
