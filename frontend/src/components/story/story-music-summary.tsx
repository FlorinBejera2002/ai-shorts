import { useStoryMusicTrack } from './use-story-music'
import { useStoryLanguage } from './use-story-language'
import type { StoryMusicOptions } from './types'

export function StoryMusicSummary({ music }: { music: StoryMusicOptions }) {
  const text = useStoryLanguage()
  const track = useStoryMusicTrack(music.track_id)
  return (
    <div className="space-y-1 text-sm" data-testid="music-summary">
      <p className="break-words">
        {text('Music', 'Muzică')}: {track.data?.title ?? text('Selected track', 'Piesa selectată')}
        {track.data ? ` · ${track.data.artist}` : ''}
      </p>
      <p className="text-xs text-muted-foreground">
        {Math.round(music.volume * 100)}% · {music.sync
          ? text('Eligible cuts follow the beat; speech is preserved.', 'Tăieturile potrivite urmează ritmul; vorbirea este păstrată.')
          : text('Background music; existing cut timing is kept.', 'Muzică de fundal; momentele tăieturilor sunt păstrate.')}
      </p>
      <p className="text-xs text-muted-foreground">
        {text('A music credit is included at the end of the video. Full credits are also available to copy when publishing.', 'Un credit muzical este inclus la finalul videoului. Creditele complete vor fi disponibile și pentru copiere la publicare.')}
      </p>
    </div>
  )
}
