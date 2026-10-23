import { Button } from '@/components/ui/button'
import { Expand, Pause, Play, Volume2, VolumeX } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { formatDuration } from '@/lib/utils'
import styles from './preview-panel.module.css'

export type PreviewPlaybackState = { time: number; duration: number; playing: boolean; muted: boolean; failed: boolean; ready: boolean }

export function PreviewPlayback({ state, compact, onExpand, onTogglePlayback, onSeek, onToggleMute }: {
  state: PreviewPlaybackState
  compact: boolean
  onExpand: () => void
  onTogglePlayback: () => void
  onSeek: (time: number) => void
  onToggleMute: () => void
}) {
  const t = useTranslations('brand.previewDesign')
  return (
    <div className={`${styles.playback} ${compact ? styles.compactPlayback : ''}`}>
      <input type="range" className={styles.seek} min={0} max={state.duration || 1} step="0.01" value={state.time} disabled={!state.ready || !state.duration} aria-label={t('seek')} data-brand-preview-seek="" onChange={event => onSeek(Number(event.target.value))} />
      <div className={styles.playbackRow}>
        <Button type="button" variant="ghost" size="icon" disabled={!state.ready || state.failed} onClick={onTogglePlayback} aria-label={t(state.playing ? 'pause' : 'play')} data-brand-preview-play="">{state.playing ? <Pause className="size-4 fill-current" /> : <Play className="size-4 fill-current" />}</Button>
        <span className={styles.time}>{compact ? formatDuration(state.duration) : `${formatDuration(state.time)} / ${formatDuration(state.duration)}`}</span>
        <Button type="button" variant="ghost" size="icon" disabled={!state.ready} className={styles.mute} onClick={onToggleMute} aria-label={t(state.muted ? 'unmute' : 'mute')} data-brand-preview-mute="">{state.muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}</Button>
        <Button type="button" variant="ghost" size="icon" onClick={onExpand} aria-label={t('expand')} data-brand-preview-expand=""><Expand className="size-4" /></Button>
      </div>
    </div>
  )
}
