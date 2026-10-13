import { useId, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ChevronDown, Music2, Play, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { MusicTrack, StoryMusicOptions } from './types'
import { StoryMusicCatalog } from './story-music-catalog'
import { StoryMusicPreview } from './story-music-preview'
import { useStoryMusicTrack } from './use-story-music'
import { useStoryLanguage } from './use-story-language'

export function StoryMusic({
  value,
  disabled,
  active,
  onChange
}: {
  value?: StoryMusicOptions | null
  disabled: boolean
  active: boolean
  onChange: (music: StoryMusicOptions | null) => void
}) {
  const text = useStoryLanguage()
  const id = useId()
  const queryClient = useQueryClient()
  const [browsing, setBrowsing] = useState(false)
  const [preview, setPreview] = useState<{ track: MusicTrack; selection?: string } | null>(null)
  const selected = useStoryMusicTrack(value?.track_id)

  function select(track: MusicTrack) {
    queryClient.setQueryData(['music-track', track.id], track)
    setPreview(null)
    onChange({ track_id: track.id, volume: value?.volume ?? 0.18, sync: value?.sync ?? true })
  }

  return (
    <fieldset disabled={disabled} className="min-w-0 space-y-4 border-t pt-4" data-testid="story-music">
      <legend className="sr-only">{text('Background music', 'Muzică de fundal')}</legend>
      <div className="space-y-1">
        <h3 className="flex items-center gap-2 text-sm font-medium">
          <Music2 className="size-4" aria-hidden="true" />
          {text('Background music', 'Muzică de fundal')}
          <span className="rounded-sm bg-muted px-1.5 py-0.5 text-xs font-normal">{text('Free', 'Gratuit')}</span>
        </h3>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {text('Music by Kevin MacLeod. No music account needed. Include the credits when publishing.', 'Muzică de Kevin MacLeod. Fără cont muzical suplimentar. Include creditele când publici.')}
        </p>
      </div>
      {value && (
        <div className="space-y-4 rounded-md border p-3" data-testid="selected-music">
          <div className="flex min-w-0 items-start justify-between gap-2">
            <div className="min-w-0 space-y-1">
              <p className="break-words text-sm font-medium">{selected.data?.title ?? text('Selected music', 'Muzica selectată')}</p>
              {selected.data && (
                <p className="text-xs text-muted-foreground">
                  {selected.data.artist} · <a className="underline underline-offset-2" href={selected.data.license_url} target="_blank" rel="noreferrer">{selected.data.license}</a>
                </p>
              )}
              {selected.isLoading && <p role="status" className="text-xs text-muted-foreground">{text('Loading track details…', 'Se încarcă detaliile piesei…')}</p>}
              {selected.isError && (
                <div role="status" className="space-y-2 text-xs text-muted-foreground">
                  <p>{text('Track details are unavailable. Your choice is still saved.', 'Detaliile piesei nu sunt disponibile. Alegerea ta este salvată.')}</p>
                  <Button type="button" variant="outline" size="sm" onClick={() => void selected.refetch()}>{text('Retry track details', 'Reîncearcă detaliile piesei')}</Button>
                </div>
              )}
            </div>
            <div className="flex shrink-0 gap-1">
              {selected.data && (
                <Button type="button" variant="ghost" size="icon" aria-label={text('Preview selected music', 'Ascultă muzica selectată')} onClick={() => setPreview({ track: selected.data!, selection: value.track_id })}>
                  <Play className="size-4" aria-hidden="true" />
                </Button>
              )}
              <Button type="button" variant="ghost" size="icon" aria-label={text('Remove music', 'Elimină muzica')} onClick={() => { setPreview(null); onChange(null) }}>
                <X className="size-4" aria-hidden="true" />
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <label htmlFor={`${id}-volume`} className="flex items-center justify-between gap-3 text-xs">
              <span>{text('Music volume', 'Volumul muzicii')}</span>
              <span className="tabular-nums">{Math.round(value.volume * 100)}%</span>
            </label>
            <input id={`${id}-volume`} type="range" min="0" max="1" step="0.01" value={value.volume} onChange={(event) => onChange({ ...value, volume: Number(event.target.value) })} className="block w-full accent-foreground" />
          </div>
          <div className="space-y-1.5">
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={value.sync} onChange={(event) => onChange({ ...value, sync: event.target.checked })} className="mt-0.5 size-4 shrink-0 accent-foreground" aria-describedby={`${id}-sync-note`} />
              {text('Match the edit to the music', 'Potrivește montajul cu muzica')}
            </label>
            <p id={`${id}-sync-note`} className="text-xs leading-relaxed text-muted-foreground">
              {text('Eligible cuts follow the beat. Speech stays intact, and the music lowers while someone speaks.', 'Tăieturile potrivite urmează ritmul. Vorbirea rămâne intactă, iar muzica scade când cineva vorbește.')}
            </p>
          </div>
        </div>
      )}
      {preview && preview.selection === value?.track_id && (
        <StoryMusicPreview key={preview.track.id} track={preview.track} active={active && !disabled} onClose={() => setPreview(null)} />
      )}
      <Button type="button" variant="outline" className="w-full justify-between" aria-expanded={browsing} aria-controls={`${id}-catalog`} onClick={() => { setBrowsing(!browsing); setPreview(null) }}>
        {browsing ? text('Close music catalog', 'Închide catalogul muzical') : value ? text('Change music', 'Schimbă muzica') : text('Browse free music', 'Explorează muzica gratuită')}
        <ChevronDown className={`size-4 ${browsing ? 'rotate-180' : ''}`} aria-hidden="true" />
      </Button>
      <div id={`${id}-catalog`}>
        {browsing && <StoryMusicCatalog selectedID={value?.track_id} onSelect={select} onPreview={(track) => setPreview({ track, selection: value?.track_id })} />}
      </div>
    </fieldset>
  )
}
