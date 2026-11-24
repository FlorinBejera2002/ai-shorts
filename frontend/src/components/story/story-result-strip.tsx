import { formatDuration } from '@/lib/youtube'
import type { StoryResultClip } from './story-result-outputs'
import { useStoryLanguage } from './use-story-language'

interface Props {
  clips: StoryResultClip[]
  selected: number
  onSelect: (position: number) => void
}

/** Compact list of the clips of a multi-clip result; the pressed item drives the preview. */
export function StoryResultStrip({ clips, selected, onSelect }: Props) {
  const text = useStoryLanguage()
  return (
    <ol className="story-result-strip" aria-label={text('Clips in this result', 'Clipurile din acest rezultat')}>
      {clips.map((clip, position) => (
        <li key={clip.id}>
          <button
            type="button"
            className="story-result-strip-item"
            aria-pressed={position === selected}
            data-selected={position === selected || undefined}
            onClick={() => onSelect(position)}
          >
            <span className="story-result-strip-thumb">
              {clip.posterUrl && <img src={clip.posterUrl} alt="" />}
            </span>
            <span className="story-result-strip-text">
              <strong>
                {text('Clip', 'Clipul')} {clip.index + 1}
              </strong>
              <small className="tabular-nums">{formatDuration(clip.durationSeconds)}</small>
            </span>
          </button>
        </li>
      ))}
    </ol>
  )
}
