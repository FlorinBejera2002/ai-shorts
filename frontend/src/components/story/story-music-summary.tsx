import { useStoryMusicTrack } from './use-story-music'
import { useStoryLanguage } from './use-story-language'
import type { StoryMusicOptions } from './types'

export function StoryMusicSummary({
  music,
  narration = false
}: {
  music: StoryMusicOptions
  narration?: boolean
}) {
  const text = useStoryLanguage()
  const track = useStoryMusicTrack(music.track_id)
  return (
    <div className="space-y-1 text-sm" data-testid="music-summary">
      <p className="break-words">
        {text('Music', 'Muzică')}:{' '}
        {music.upload_reference
          ? music.title || text('Uploaded music', 'Muzică încărcată')
          : (track.data?.title ?? text('Selected track', 'Piesa selectată'))}
        {track.data ? ` · ${track.data.artist}` : ''}
      </p>
      <p className="text-xs text-muted-foreground">
        {Math.round(music.volume * 100)}% ·{' '}
        {music.volume === 0
          ? text('Music muted; music-guided pacing off.', 'Muzică fără volum; montaj ghidat de muzică oprit.')
          : music.sync
          ? text(
              'Music guides pacing and shot choices. Clear rhythmic accents guide precise cuts where the action allows.',
              'Muzica ghidează ritmul montajului și alegerea cadrelor. Accentele ritmice clare ghidează tăieturile precise unde acțiunea permite.'
            )
          : text(
              'Background music; existing cut timing is kept.',
              'Muzică de fundal; momentele tăieturilor sunt păstrate.'
            )}
      </p>
      <p className="text-xs text-muted-foreground">
        {narration
          ? text('Full narration preserved.', 'Narațiunea integrală este păstrată.')
          : music.source_audio === 'mute'
            ? text(
                'Music only. Original clip sound and dialogue are muted.',
                'Doar muzică. Sunetul original și dialogul sunt oprite.'
              )
            : text(
                'Original clip sound and dialogue are kept.',
                'Sunetul original și dialogul sunt păstrate.'
              )}
      </p>
      <p className="text-xs text-muted-foreground">
        {text('Excerpt', 'Fragment')}: {music.start_seconds ?? 0}s –{' '}
        {music.end_seconds
          ? `${music.end_seconds}s`
          : text('automatic end', 'sfârșit automat')}
        {' · '}
        {music.loop === false
          ? text('Play once', 'O singură redare')
          : text('Repeat if needed', 'Repetă dacă este necesar')}
      </p>
      {!music.upload_reference && (
        <p className="text-xs text-muted-foreground">
          {text(
            'A music credit is included at the end of the video. Full credits are also available to copy when publishing.',
            'Un credit muzical este inclus la finalul videoului. Creditele complete vor fi disponibile și pentru copiere la publicare.'
          )}
        </p>
      )}
    </div>
  )
}
