import { useId, useState } from 'react'
import { Check, Play, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatDuration } from '@/lib/youtube'
import type { MusicTrack } from './types'
import { useStoryMusicCatalog } from './use-story-music'
import { useStoryLanguage } from './use-story-language'

export function StoryMusicCatalog({
  selectedID,
  onSelect,
  onPreview
}: {
  selectedID?: string
  onSelect: (track: MusicTrack) => void
  onPreview: (track: MusicTrack) => void
}) {
  const text = useStoryLanguage()
  const id = useId()
  const [input, setInput] = useState('')
  const [search, setSearch] = useState({ query: '', page: 1 })
  const catalog = useStoryMusicCatalog(search.query, search.page, true)

  return (
    <div className="space-y-3" data-testid="music-catalog">
      <form
        className="flex min-w-0 gap-2"
        role="search"
        aria-label={text('Music catalog', 'Catalog muzical')}
        onSubmit={(event) => {
          event.preventDefault()
          setSearch({ query: input.trim(), page: 1 })
        }}
      >
        <label htmlFor={id} className="sr-only">
          {text('Search music', 'Caută muzică')}
        </label>
        <Input
          id={id}
          value={input}
          maxLength={120}
          onChange={(event) => setInput(event.target.value)}
          placeholder={text('Title, mood or genre', 'Titlu, atmosferă sau gen')}
          className="min-w-0"
        />
        <Button type="submit" variant="outline" size="icon" aria-label={text('Search tracks', 'Caută piese')}>
          <Search className="size-4" aria-hidden="true" />
        </Button>
      </form>
      {catalog.isPending && (
        <p role="status" className="py-4 text-sm text-muted-foreground">
          {text('Loading music…', 'Se încarcă muzica…')}
        </p>
      )}
      {catalog.isError && (
        <div role="status" className="space-y-2 py-3 text-sm">
          <p>{text('Music is temporarily unavailable. Your selection is kept.', 'Muzica este temporar indisponibilă. Selecția ta este păstrată.')}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => void catalog.refetch()}>
            {text('Retry music search', 'Reîncearcă căutarea')}
          </Button>
        </div>
      )}
      {catalog.data && (
        <>
          <p role="status" className="text-xs text-muted-foreground">
            {catalog.data.total} {text('tracks', 'piese')}
          </p>
          {catalog.data.tracks.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">
              {text('No tracks found. Try a different title, mood or genre.', 'Nu am găsit piese. Încearcă alt titlu, altă atmosferă sau alt gen.')}
            </p>
          ) : (
            <ul className="max-h-80 divide-y overflow-y-auto rounded-md border" aria-label={text('Music tracks', 'Piese muzicale')}>
              {catalog.data.tracks.map((track) => (
                <li key={track.id} className="flex min-w-0 items-center gap-2 p-3">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="shrink-0"
                    aria-label={`${text('Preview', 'Ascultă')} ${track.title}`}
                    onClick={() => onPreview(track)}
                  >
                    <Play className="size-4" aria-hidden="true" />
                  </Button>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium" title={track.title}>{track.title}</p>
                    <p className="truncate text-xs text-muted-foreground">{track.artist} · {formatDuration(track.duration_seconds)}{track.bpm > 0 ? ` · ${track.bpm} BPM` : ''}</p>
                    {((track.genres?.length ?? 0) > 0 || (track.moods?.length ?? 0) > 0) && (
                      <p className="truncate text-xs text-muted-foreground">{[...(track.genres ?? []), ...(track.moods ?? [])].slice(0, 3).join(' · ')}</p>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant={track.id === selectedID ? 'default' : 'outline'}
                    size="sm"
                    className="shrink-0"
                    aria-pressed={track.id === selectedID}
                    aria-label={`${text('Select', 'Alege')} ${track.title}`}
                    onClick={() => onSelect(track)}
                  >
                    {track.id === selectedID ? <Check className="size-4" aria-hidden="true" /> : text('Use', 'Alege')}
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {(search.page > 1 || catalog.data.has_more) && (
            <div className="flex items-center justify-between gap-2">
              <Button type="button" variant="outline" size="sm" aria-label={text('Previous tracks', 'Piese anterioare')} disabled={search.page <= 1} onClick={() => setSearch({ ...search, page: search.page - 1 })}>
                {text('Previous', 'Înapoi')}
              </Button>
              <span className="text-xs tabular-nums text-muted-foreground">{search.page}</span>
              <Button type="button" variant="outline" size="sm" aria-label={text('Next tracks', 'Piese următoare')} disabled={!catalog.data.has_more} onClick={() => setSearch({ ...search, page: search.page + 1 })}>
                {text('Next', 'Înainte')}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
