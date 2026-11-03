import { useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { apiFetch } from '@/lib/auth'
import { extractApiError } from '@/lib/api-error'

const selectedControl = 'min-h-11 h-auto whitespace-normal bg-foreground text-background hover:bg-foreground/90 focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2'
const neutralControl = 'min-h-11 h-auto whitespace-normal hover:bg-muted focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2'

type CleanupState = {
  status: 'ready' | 'failed' | 'unchanged' | 'no_audio'
  message?: string
}

export function JobAudioCleanup({ job, onRetried }: {
  job: {
    id: string
    status: string
    processing_active?: boolean
    audio_cleanup?: CleanupState
    processed_audio_url?: string
    original_audio_url?: string
  }
  onRetried: () => void
}) {
  const t = useTranslations('audioCleanup')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [processed, setProcessed] = useState(false)
  const active = useRef(false)
  const retryRequest = useRef<{ id: string; original: boolean } | null>(null)
  const player = useRef<HTMLAudioElement>(null)
  const savedTime = useRef(0)
  const cleanup = job.audio_cleanup
  const stopped = job.status === 'failed' || job.status === 'cancelled'

  async function retry(original: boolean) {
    if (active.current || job.processing_active) return
    active.current = true
    setBusy(true)
    setError('')
    if (!retryRequest.current || retryRequest.current.original !== original) {
      retryRequest.current = { id: crypto.randomUUID(), original }
    }
    try {
      const response = await apiFetch(`/api/jobs/${job.id}/retry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          request_id: retryRequest.current.id,
          ...(original ? { audio_cleanup: { enabled: false } } : {})
        })
      })
      const data = await response.json()
      if (!response.ok) throw new Error(extractApiError(data, t('retryFailed')))
      retryRequest.current = null
      onRetried()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('retryFailed'))
    } finally {
      active.current = false
      setBusy(false)
    }
  }

  async function cancel() {
    if (active.current) return
    active.current = true
    setBusy(true)
    setError('')
    try {
      const response = await apiFetch(`/api/jobs/${job.id}/cancel`, { method: 'POST' })
      const data = await response.json()
      if (!response.ok) throw new Error(extractApiError(data, t('retryFailed')))
      onRetried()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('retryFailed'))
    } finally {
      active.current = false
      setBusy(false)
    }
  }

  function switchAudio(next: boolean) {
    savedTime.current = player.current?.currentTime ?? 0
    player.current?.pause()
    setProcessed(next)
  }

  if (!cleanup && job.status === 'completed') return null
  const cleanupMessage = cleanup?.message?.includes('not configured') || cleanup?.message?.includes('unavailable')
    ? t('unavailable')
    : cleanup?.message?.includes('timed out') ? t('timedOut') : t('failed')

  return <section className="mt-5 min-w-0 space-y-4 border-t pt-5" aria-label={t('title')} aria-busy={busy}>
    {!stopped && job.status !== 'completed' && <div className="space-y-2">
      <Button className={neutralControl} variant="outline" disabled={busy} onClick={() => void cancel()}>{t('cancel')}</Button>
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
    </div>}
    {stopped && <div className="space-y-3">
      {cleanup?.status === 'failed' && <p className="text-sm" role="alert">{cleanupMessage}</p>}
      <div className="flex flex-wrap gap-2">
        <Button className={selectedControl} disabled={busy || job.processing_active} onClick={() => void retry(false)}>{busy ? t('retrying') : t('retry')}</Button>
        {cleanup?.status === 'failed' && <Button className={neutralControl} variant="outline" disabled={busy || job.processing_active} onClick={() => void retry(true)}>{t('useOriginal')}</Button>}
      </div>
      {job.processing_active && <p className="text-sm text-muted-foreground" role="status">{t('stopping')}</p>}
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
    </div>}
    {job.original_audio_url && <details>
      <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground">{t('compare')}</summary>
      <div className="mt-3 space-y-3">
        <div className="flex gap-2">
          <Button className={processed ? neutralControl : selectedControl} size="sm" variant={processed ? 'outline' : 'default'} aria-pressed={!processed} onClick={() => switchAudio(false)}>{t('original')}</Button>
          <Button className={processed ? selectedControl : neutralControl} size="sm" variant={processed ? 'default' : 'outline'} aria-pressed={processed} disabled={!job.processed_audio_url} onClick={() => switchAudio(true)}>{t('processed')}</Button>
        </div>
        <audio ref={player} controls preload="metadata" className="w-full" aria-label={t('compare')}
          src={processed ? job.processed_audio_url : job.original_audio_url}
          onLoadedMetadata={(event) => { event.currentTarget.currentTime = Math.min(savedTime.current, event.currentTarget.duration || 0) }} />
      </div>
    </details>}
  </section>
}
