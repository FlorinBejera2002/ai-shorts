import { Maximize, Pause, Play, Volume2, VolumeX } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { CSSProperties } from 'react'
import styles from './preview-card.module.css'

export type PreviewPlaybackState = { time: number; duration: number; playing: boolean; muted: boolean; failed: boolean; ready: boolean }

/** Player bar inside the clip: play, progress, sound and full screen. */
export function PreviewPlayback({
  state,
  onTogglePlayback,
  onSeek,
  onToggleMute,
  onFullscreen
}: {
  state: PreviewPlaybackState
  onTogglePlayback: () => void
  onSeek: (time: number) => void
  onToggleMute: () => void
  onFullscreen: () => void
}) {
  const t = useTranslations('brand.previewDesign')
  const progress = state.duration ? Math.min(100, (state.time / state.duration) * 100) : 0
  return (
    <div className={styles.playback} data-brand-playback="">
      <button
        type="button"
        className={styles.playButton}
        disabled={!state.ready || state.failed}
        aria-label={t(state.playing ? 'pause' : 'play')}
        onClick={onTogglePlayback}
        data-brand-preview-play=""
      >
        {state.playing ? <Pause className="fill-current" aria-hidden="true" /> : <Play className="fill-current" aria-hidden="true" />}
      </button>
      <input
        type="range"
        className={styles.seek}
        style={{ '--progress': `${progress}%` } as CSSProperties}
        min={0}
        max={state.duration || 1}
        step="0.01"
        value={state.time}
        disabled={!state.ready || !state.duration}
        aria-label={t('seek')}
        onChange={(event) => onSeek(Number(event.target.value))}
        data-brand-preview-seek=""
      />
      <button
        type="button"
        className={styles.playButton}
        disabled={!state.ready}
        aria-label={t(state.muted ? 'unmute' : 'mute')}
        onClick={onToggleMute}
        data-brand-preview-mute=""
      >
        {state.muted ? <VolumeX aria-hidden="true" /> : <Volume2 aria-hidden="true" />}
      </button>
      <button type="button" className={styles.playButton} aria-label={t('expand')} onClick={onFullscreen} data-brand-preview-expand="">
        <Maximize aria-hidden="true" />
      </button>
    </div>
  )
}
