import { useRef, useState } from 'react'
import { ArrowRightLeft, Gauge, Layers, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import type { StoryBlock, StoryProject, StoryVersion } from './types'
import { StoryReview } from './story-review'
import { StoryScene } from './story-scene'
import { StoryResultHeader } from './story-result-header'
import { useStoryLanguage } from './use-story-language'
import './story-editor.css'

interface Props {
  project: StoryProject
  version: StoryVersion
  disabled: boolean
  onAction: (action: string, blockID?: string, candidateID?: string) => void
  onLock: (block: StoryBlock, patch: Partial<StoryBlock>) => void
  onRollback: (version: number) => void
}

export function StoryEditor({
  project,
  version,
  disabled,
  onAction,
  onLock,
  onRollback
}: Props) {
  const text = useStoryLanguage()
  const video = useRef<HTMLVideoElement>(null)
  const [media, setMedia] = useState<{ url: string; duration: number }>()
  const narration = Boolean(project.options.narration)
  const timelineDuration = Math.max(
    0,
    ...version.timeline.map((entry) => entry.output_out)
  )
  const duration =
    media && media.url === version.preview_url
      ? media.duration
      : timelineDuration
  const oldVersions = (project.versions ?? []).filter(
    (item) => item.accepted && item.number !== version.number
  )

  function seekTo(seconds: number) {
    const player = video.current
    if (!player) return
    const end = Number.isFinite(player.duration) ? player.duration : seconds
    player.currentTime = Math.max(0, Math.min(seconds, end))
    player.scrollIntoView({ behavior: 'smooth', block: 'center' })
    player.focus({ preventScroll: true })
  }

  return (
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(22rem,1fr)]">
      <div className="min-w-0 space-y-5">
        <Card className="story-result-surface block space-y-4 border-0 p-5">
          <StoryResultHeader
            version={version}
            duration={duration}
            aspectRatio={project.options.aspect_ratio}
          />
          {version.preview_url ? (
            <div className="flex justify-center rounded-md bg-muted p-3">
              <video
                ref={video}
                src={version.preview_url}
                poster={version.thumbnail_url}
                controls
                playsInline
                preload="metadata"
                tabIndex={0}
                onLoadedMetadata={(event) => {
                  const loadedDuration = event.currentTarget.duration
                  if (Number.isFinite(loadedDuration) && version.preview_url) {
                    setMedia({
                      url: version.preview_url,
                      duration: loadedDuration
                    })
                  }
                }}
                className="max-h-[28rem] w-auto max-w-full rounded-md bg-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
                aria-label={text('Story preview', 'Previzualizare poveste')}
              />
            </div>
          ) : (
            <p className="rounded-md bg-muted p-4 text-sm">
              {text(
                'A playable preview is not available for this version.',
                'Nu există o previzualizare redabilă pentru această versiune.'
              )}
            </p>
          )}
        </Card>
        <Card
          as="section"
          className="story-result-surface block space-y-4 border-0 p-5"
        >
          <div>
            <h2 className="font-semibold">
              {text('Improve your video', 'Îmbunătățește videoul')}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {narration
                ? text(
                    'Adjust the edit while keeping your narration unchanged.',
                    'Ajustează montajul păstrând narațiunea neschimbată.'
                  )
                : text(
                    'Choose what to improve across the entire video.',
                    'Alege ce vrei să îmbunătățești în întregul video.'
                  )}
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {!narration && (
              <Button
                variant="outline"
                size="sm"
                className="h-auto items-start justify-start gap-2 whitespace-normal p-3 text-left"
                disabled={disabled}
                onClick={() => onAction('faster')}
                aria-label={text('Faster pace', 'Ritm mai alert')}
              >
                <Gauge className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <span className="space-y-1">
                  <span className="block">
                    {text('Faster pace', 'Ritm mai alert')}
                  </span>
                  <span className="block text-xs font-normal text-muted-foreground">
                    {text(
                      'A shorter, more dynamic edit',
                      'Un montaj mai scurt și dinamic'
                    )}
                  </span>
                </span>
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className="h-auto items-start justify-start gap-2 whitespace-normal p-3 text-left"
              disabled={disabled}
              onClick={() => onAction('improve_flow')}
              aria-label={text('Smoother flow', 'Montaj mai cursiv')}
            >
              <Layers className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span className="space-y-1">
                <span className="block">
                  {text('Smoother flow', 'Montaj mai cursiv')}
                </span>
                <span className="block text-xs font-normal text-muted-foreground">
                  {text(
                    'Connect the moments more naturally',
                    'Leagă momentele mai natural'
                  )}
                </span>
              </span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-auto items-start justify-start gap-2 whitespace-normal p-3 text-left"
              disabled={disabled}
              onClick={() => onAction('improve_transitions')}
              aria-label={text('Smoother transitions', 'Tranziții mai fluide')}
            >
              <ArrowRightLeft
                className="mt-0.5 size-4 shrink-0"
                aria-hidden="true"
              />
              <span className="space-y-1">
                <span className="block">
                  {text('Smoother transitions', 'Tranziții mai fluide')}
                </span>
                <span className="block text-xs font-normal text-muted-foreground">
                  {text(
                    'Soften the cuts between scenes',
                    'Fă trecerile dintre scene mai line'
                  )}
                </span>
              </span>
            </Button>
          </div>
          {oldVersions.length > 0 && (
            <details className="pt-3">
              <summary className="cursor-pointer text-sm font-medium">
                {text('Previous versions', 'Versiuni anterioare')}
              </summary>
              <label className="mt-3 block space-y-2 text-sm">
                <span className="flex items-center gap-2">
                  <RotateCcw className="size-4" aria-hidden="true" />
                  {text(
                    'Restore a previous version',
                    'Revino la o versiune anterioară'
                  )}
                </span>
                <select
                  className="story-select"
                  aria-label={text('Restore version', 'Restaurează versiunea')}
                  value=""
                  disabled={disabled}
                  onChange={(event) => {
                    if (event.target.value)
                      onRollback(Number(event.target.value))
                  }}
                >
                  <option value="">
                    {text(
                      'Choose a saved version…',
                      'Alege o versiune salvată…'
                    )}
                  </option>
                  {oldVersions.map((item) => (
                    <option key={item.number} value={item.number}>
                      {text('Version', 'Versiunea')} {item.number} ·{' '}
                      {item.report.status === 'ready'
                        ? text('Ready', 'Pregătită')
                        : text('Draft', 'Versiune preliminară')}
                    </option>
                  ))}
                </select>
              </label>
            </details>
          )}
        </Card>
        <StoryReview
          version={version}
          attempts={project.attempts}
          onSeek={version.preview_url ? seekTo : undefined}
        />
        {(version.plan.gaps ?? []).length > 0 && (
          <details className="pt-3">
            <summary className="cursor-pointer text-sm font-medium">
              {text('Missing from your recordings', 'Ce lipsește din filmări')}
            </summary>
            <div className="mt-3 space-y-2">
              {version.plan.gaps?.map((gap, index) => (
                <p
                  key={`${index}-${gap}`}
                  className="text-sm text-muted-foreground"
                >
                  {gap}
                </p>
              ))}
            </div>
          </details>
        )}
      </div>

      <Card className="story-result-surface block min-w-0 border-0 p-5">
        <div>
          <h2 className="font-semibold">
            {text('Scenes', 'Scene')} · {version.plan.blocks.length}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {text(
              'View a scene in your video. Open its details to change it.',
              'Vezi o scenă în video. Deschide detaliile pentru a o modifica.'
            )}
          </p>
        </div>
        <ol className="mt-4 space-y-2 xl:max-h-[40rem] xl:overflow-y-auto">
          {version.plan.blocks.map((block, index) => (
            <StoryScene
              key={block.id}
              project={project}
              version={version}
              block={block}
              index={index}
              disabled={disabled}
              onAction={onAction}
              onLock={onLock}
              onSeek={version.preview_url ? seekTo : undefined}
            />
          ))}
        </ol>
      </Card>
    </div>
  )
}
