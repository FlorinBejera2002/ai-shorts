'use client'

import { useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'

type CleanupState = {
  status: 'ready' | 'failed' | 'unchanged' | 'no_audio'
  message?: string
}

interface JobAudioCleanupProps {
  job: {
    status: string
    audio_cleanup?: CleanupState
    processed_audio_url?: string
    original_audio_url?: string
  }
  busy: boolean
  /** Continues the stopped job with the original audio. */
  onKeepOriginalAudio: () => void
}

/** Audio result beneath the processing card: cleanup failure notice, original-audio retry and comparison. */
export function JobAudioCleanup({ job, busy, onKeepOriginalAudio }: JobAudioCleanupProps) {
  const t = useTranslations('audioCleanup')
  const [processed, setProcessed] = useState(false)
  const player = useRef<HTMLAudioElement>(null)
  const savedTime = useRef(0)
  const cleanup = job.audio_cleanup
  const stopped = job.status === 'failed' || job.status === 'cancelled'

  if (!cleanup && job.status === 'completed') return null

  function switchAudio(next: boolean) {
    savedTime.current = player.current?.currentTime ?? 0
    player.current?.pause()
    setProcessed(next)
  }

  const cleanupMessage =
    cleanup?.message?.includes('not configured') || cleanup?.message?.includes('unavailable')
      ? t('unavailable')
      : cleanup?.message?.includes('timed out')
        ? t('timedOut')
        : t('failed')

  return (
    <section className="job-audio-cleanup w-full min-w-0 space-y-4" aria-label={t('title')} aria-busy={busy}>
      {stopped && cleanup?.status === 'failed' && (
        <div className="space-y-3">
          <p className="text-sm" role="alert">{cleanupMessage}</p>
          <Button variant="outline" className="rounded-full" disabled={busy} onClick={onKeepOriginalAudio}>
            {t('useOriginal')}
          </Button>
        </div>
      )}
      {job.original_audio_url && (
        <details>
          <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium">{t('compare')}</summary>
          <div className="mt-3 space-y-3">
            <div className="flex gap-2">
              <Button
                size="sm"
                className="rounded-full"
                variant={processed ? 'outline' : 'default'}
                aria-pressed={!processed}
                onClick={() => switchAudio(false)}
              >
                {t('original')}
              </Button>
              <Button
                size="sm"
                className="rounded-full"
                variant={processed ? 'default' : 'outline'}
                aria-pressed={processed}
                disabled={!job.processed_audio_url}
                onClick={() => switchAudio(true)}
              >
                {t('processed')}
              </Button>
            </div>
            <audio
              ref={player}
              controls
              preload="metadata"
              className="w-full"
              aria-label={t('compare')}
              src={processed ? job.processed_audio_url : job.original_audio_url}
              onLoadedMetadata={(event) => {
                event.currentTarget.currentTime = Math.min(savedTime.current, event.currentTarget.duration || 0)
              }}
            />
          </div>
        </details>
      )}
    </section>
  )
}
