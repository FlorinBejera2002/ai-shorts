import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { storyRequest } from '@/components/story/api'
import type { StoryProject } from '@/components/story/types'
import type { AgentRun } from './model'

function mediaUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null
  try {
    const url = new URL(value, window.location.origin)
    return url.protocol === 'https:' || (url.protocol === 'http:' && url.origin === window.location.origin) ? url.href : null
  } catch { return null }
}
export function ResultPreview({ run, ro }: { run: AgentRun; ro: boolean }) {
  const [opened, setOpened] = useState(false)
  const [playbackFailed, setPlaybackFailed] = useState(false)
  const renderNames = ['stories.generate', 'stories.revise', 'clips.trim', 'clips.recut', 'clips.get']
  const completedStep = [...(run.steps ?? [])].reverse().find(step => renderNames.includes(step.action.name))
  const receipt = run.action && renderNames.includes(run.action.name) ? { action: run.action, result: run.result } : completedStep
  const action = receipt?.action.name ?? ''
  const story = action === 'stories.generate' || action === 'stories.revise'
  const clip = action === 'clips.trim' || action === 'clips.recut' || action === 'clips.get'
  const id = receipt?.result?.data?.id ?? receipt?.result?.data?.clip_id ?? receipt?.action.input.id
  const valid = run.status === 'completed' && (story || clip) && typeof id === 'string' && /^[a-f\d-]{36}$/i.test(id)
  const preview = useQuery({ queryKey: ['workspace-agent', 'preview', run.id, run.revision], enabled: opened && valid,
    staleTime: 0, gcTime: 0, retry: false,
    queryFn: async ({ signal }) => {
      if (story) {
        const current = await storyRequest<StoryProject>(`/api/stories/${id}`, 'GET', undefined, signal)
        const expected = receipt?.result?.data?.current_version
        const version = current.versions.find(item => item.number === expected && item.accepted)
        if (current.current_version !== expected || !version?.preview_url) throw new Error(ro ? 'Rezultatul s-a schimbat. Deschide povestea pentru versiunea curentă.' : 'The result changed. Open the story for its current version.')
        const url = mediaUrl(version.preview_url)
        if (!url) throw new Error(ro ? 'Previzualizarea nu este disponibilă.' : 'Preview is unavailable.')
        return { url, transcript: '' }
      }
      const current = await storyRequest<Record<string, unknown>>(`/api/clips/${id}`, 'GET', undefined, signal)
      const url = mediaUrl(current.file_url ?? current.fileUrl)
      if (!url) throw new Error(ro ? 'Previzualizarea nu este disponibilă.' : 'Preview is unavailable.')
      return { url, transcript: typeof current.transcript_text === 'string' ? current.transcript_text : '' }
    } })
  if (!valid) return null
  return <section className="space-y-2 rounded-md border p-3" aria-label={ro ? 'Previzualizare video' : 'Video preview'}>
    {!opened ? <Button size="sm" variant="outline" onClick={() => setOpened(true)}>{ro ? 'Încarcă previzualizarea' : 'Load preview'}</Button> : <>
      <p className="text-xs font-medium">{story ? (ro ? 'Versiunea acceptată' : 'Accepted version') : (ro ? 'Clipul salvat acum' : 'Current saved clip')}</p>
      {preview.isPending && <p role="status" className="text-xs">{ro ? 'Se încarcă…' : 'Loading…'}</p>}
      {preview.data && !preview.isError && !playbackFailed && <video controls playsInline preload="metadata" src={preview.data.url} aria-label={ro ? 'Previzualizare rezultat' : 'Result preview'} onError={() => setPlaybackFailed(true)} className="max-h-72 w-full rounded-md bg-black" />}
      {preview.data?.transcript && <details className="text-xs"><summary>{ro ? 'Transcriere' : 'Transcript'}</summary><p className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap">{preview.data.transcript}</p></details>}
      {(preview.isError || playbackFailed) && <p role="alert" className="text-xs text-destructive">{preview.error instanceof Error ? preview.error.message : ro ? 'Linkul media a expirat sau redarea a eșuat.' : 'The media link expired or playback failed.'}</p>}
      <Button size="sm" variant="ghost" disabled={preview.isFetching} onClick={() => { setPlaybackFailed(false); void preview.refetch() }}>{ro ? 'Reîncarcă previzualizarea' : 'Refresh preview'}</Button>
    </>}
  </section>
}
