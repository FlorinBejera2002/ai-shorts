import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import type { StoryAsset } from './types'
import { useStoryLanguage } from './use-story-language'

export function StoryAudioComparison({
  assets,
  disabled,
  enabled,
  onOriginal,
  onRetry
}: {
  assets: StoryAsset[]
  disabled: boolean
  enabled: boolean
  onOriginal: () => void
  onRetry?: () => void
}) {
  const text = useStoryLanguage()
  const sources = assets.filter((asset) => asset.audio_cleanup)
  const [selected, setSelected] = useState('')
  const [processed, setProcessed] = useState(false)
  const player = useRef<HTMLAudioElement>(null)
  const time = useRef(0)
  if (!sources.length) return null
  const source = sources.find((asset) => asset.id === selected) ?? sources[0]!
  const failed = enabled && sources.some(
    (asset) => asset.audio_cleanup?.status === 'failed'
  )
  function switchAudio(next: boolean) {
    time.current = player.current?.currentTime ?? 0
    player.current?.pause()
    setProcessed(next)
  }
  return (
    <details className="border-t pt-3">
      <summary className="cursor-pointer text-sm font-medium">
        {text('Compare audio', 'Compară sunetul')}
      </summary>
      <div className="mt-3 space-y-3">
        <label className="block text-sm">
          {text('Recording', 'Înregistrare')}
          <select
            aria-label={text('Recording', 'Înregistrare')}
            className="story-select mt-1"
            value={source.id}
            onChange={(event) => {
              setSelected(event.target.value)
              setProcessed(false)
              time.current = 0
            }}
          >
            {sources.map((asset) => (
              <option key={asset.id} value={asset.id}>
                {asset.name}
              </option>
            ))}
          </select>
        </label>
        {source.audio_cleanup?.status === 'no_audio' ? (
          <p className="text-sm">
            {text('This clip has no audio.', 'Această filmare nu are sunet.')}
          </p>
        ) : (
          <>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={!processed ? 'default' : 'outline'}
                aria-pressed={!processed}
                onClick={() => switchAudio(false)}
              >
                {text('Original', 'Original')}
              </Button>
              <Button
                size="sm"
                variant={processed ? 'default' : 'outline'}
                aria-pressed={processed}
                disabled={!source.processed_audio_url}
                onClick={() => switchAudio(true)}
              >
                {text('Processed', 'Procesat')}
              </Button>
            </div>
            <audio
              ref={player}
              className="w-full"
              controls
              preload="metadata"
              src={processed ? source.processed_audio_url : source.source_url}
              aria-label={text('Audio comparison', 'Comparație audio')}
              onLoadedMetadata={(event) => {
                event.currentTarget.currentTime = Math.min(
                  time.current,
                  event.currentTarget.duration || 0
                )
              }}
            />
            {source.audio_cleanup?.status === 'unchanged' && (
              <p className="text-sm">
                {text(
                  'Original sound kept: no verified speech to clean.',
                  'Sunetul original a fost păstrat: nu există vorbire verificată de curățat.'
                )}
              </p>
            )}
          </>
        )}
        {failed && (
          <div className="space-y-2" role="alert">
            <p className="text-sm">
              {text(
                'Audio cleanup failed. Your originals are preserved.',
                'Curățarea sunetului a eșuat. Originalele sunt păstrate.'
              )}
            </p>
            <div className="flex flex-wrap gap-2">
              {onRetry && <Button
                size="sm"
                variant="outline"
                disabled={disabled}
                onClick={onRetry}
              >
                {text('Retry cleanup', 'Reîncearcă curățarea')}
              </Button>}
              <Button
                size="sm"
                variant="outline"
                disabled={disabled}
                onClick={onOriginal}
              >
                {text(
                  'Continue with original audio',
                  'Continuă cu sunetul original'
                )}
              </Button>
            </div>
          </div>
        )}
      </div>
    </details>
  )
}
