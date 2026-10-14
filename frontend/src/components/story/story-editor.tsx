import { useRef, useState } from 'react'
import {
  ArrowRightLeft,
  Gauge,
  Layers,
  RotateCcw,
  Scissors,
  Type
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import type {
  StoryBlock,
  StoryOptions,
  StoryProject,
  StoryVersion
} from './types'
import { StoryAppearance } from './story-appearance'
import { StoryReview } from './story-review'
import { StoryResultHeader } from './story-result-header'
import { StoryClipEditor } from './story-clip-editor'
import { useStoryLanguage } from './use-story-language'
import { StoryMusicCredits } from './story-music-credits'

interface Props {
  project: StoryProject
  version: StoryVersion
  disabled: boolean
  onAction: (action: string, blockID?: string, candidateID?: string) => void
  onLock: (block: StoryBlock, patch: Partial<StoryBlock>) => void
  onRollback: (version: number) => void
  onRestyle: (options: StoryOptions) => void
}

export function StoryEditor({
  project,
  version,
  disabled,
  onAction,
  onLock,
  onRollback,
  onRestyle
}: Props) {
  const text = useStoryLanguage()
  const video = useRef<HTMLVideoElement>(null)
  const [media, setMedia] = useState<{ url: string; duration: number }>()
  const [editing, setEditing] = useState(false)
  const [appearance, setAppearance] = useState(false)
  const [styleOptions, setStyleOptions] = useState(project.options)
  const [comparison, setComparison] = useState<number>()
  const shown =
    project.versions.find(
      (item) => item.number === comparison && item.accepted && item.preview_url
    ) ?? version
  const comparing = shown.number !== version.number
  const duration =
    media && media.url === shown.preview_url
      ? media.duration
      : (shown.output?.duration ??
        shown.timeline.reduce(
          (end, entry) => Math.max(end, entry.output_out),
          0
        ))
  const oldVersions = project.versions.filter(
    (item) =>
      item.accepted && item.preview_url && item.number !== version.number
  )
  function seekTo(seconds: number) {
    if (!video.current) return
    video.current.currentTime = Math.max(
      0,
      Math.min(
        seconds,
        Number.isFinite(video.current.duration)
          ? video.current.duration
          : seconds
      )
    )
    video.current.focus({ preventScroll: true })
  }
  const actions = [
    ...(!project.options.narration
      ? [
          {
            action: 'faster',
            icon: Gauge,
            label: text('Faster pace', 'Ritm mai alert'),
            hint: text(
              'Tighten the edit while keeping the original voice and speed.',
              'Scurtează montajul păstrând vocea și viteza originale.'
            )
          }
        ]
      : []),
    {
      action: 'improve_flow',
      icon: Layers,
      label: text('Smoother flow', 'Montaj mai cursiv'),
      hint: text(
        'Improve the selection and order of moments.',
        'Îmbunătățește selecția și ordinea momentelor.'
      )
    },
    {
      action: 'improve_transitions',
      icon: ArrowRightLeft,
      label: text('Smoother transitions', 'Tranziții mai fluide'),
      hint: text(
        'Soften the cuts between clips.',
        'Fă trecerile dintre filmări mai line.'
      )
    }
  ]
  return (
    <section className="min-w-0 space-y-4" data-testid="story-result">
      <StoryResultHeader
        version={shown}
        duration={duration}
        aspectRatio={
          shown.render_options?.aspect_ratio ?? project.options.aspect_ratio
        }
      />
      {shown.preview_url ? (
        <div className="flex min-h-48 justify-center overflow-hidden rounded-md bg-muted">
          <video
            ref={video}
            src={shown.preview_url}
            poster={shown.thumbnail_url}
            controls
            playsInline
            preload="metadata"
            tabIndex={0}
            onLoadedMetadata={(event) => {
              if (
                Number.isFinite(event.currentTarget.duration) &&
                shown.preview_url
              )
                setMedia({
                  url: shown.preview_url,
                  duration: event.currentTarget.duration
                })
            }}
            className="max-h-[min(65dvh,42rem)] min-h-48 w-full rounded-md bg-black object-contain focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
            aria-label={text('Story preview', 'Previzualizare poveste')}
          />
        </div>
      ) : (
        <p role="alert" className="rounded-md border p-3 text-sm">
          {text(
            'This version has no playable export. Try generating it again.',
            'Această versiune nu are un export redabil. Reîncearcă generarea.'
          )}
        </p>
      )}
      <div
        className="flex flex-wrap items-center gap-2"
        aria-label={text('Improve your video', 'Îmbunătățește videoul')}
      >
        {actions.map(({ action, icon: Icon, label, hint }) => (
          <Button
            key={action}
            variant="outline"
            size="sm"
            disabled={disabled || comparing}
            onClick={() => onAction(action)}
            title={hint}
          >
            <Icon className="size-4" aria-hidden="true" />
            {label}
          </Button>
        ))}
        <Button
          variant="ghost"
          size="sm"
          aria-expanded={editing}
          aria-controls="story-clip-editor"
          onClick={() => setEditing(!editing)}
        >
          <Scissors className="size-4" aria-hidden="true" />
          {text('Edit clips', 'Editează filmările')}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={disabled || comparing}
          aria-expanded={appearance}
          onClick={() => {
            if (!appearance) setStyleOptions(project.options)
            setAppearance(!appearance)
          }}
        >
          <Type className="size-4" aria-hidden="true" />
          {text('Appearance', 'Aspect')}
        </Button>
        {oldVersions.length > 0 && (
          <label className="flex min-w-0 items-center gap-2 text-sm sm:ml-auto">
            <span className="sr-only">
              {text('Compare versions', 'Compară versiunile')}
            </span>
            <select
              className="story-select !w-auto max-w-full"
              aria-label={text('Compare versions', 'Compară versiunile')}
              value={comparing ? shown.number : ''}
              onChange={(event) =>
                setComparison(
                  event.target.value ? Number(event.target.value) : undefined
                )
              }
            >
              <option value="">
                {text('Current version', 'Versiunea curentă')}
              </option>
              {oldVersions.map((item) => (
                <option key={item.number} value={item.number}>
                  {text('Version', 'Versiunea')} {item.number}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {comparing && (
        <div
          className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm"
          role="status"
        >
          <span>
            {text(
              'Watching a previous version.',
              'Vizualizezi o versiune anterioară.'
            )}
          </span>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setComparison(undefined)}
            >
              {text('Back to current', 'Înapoi la versiunea curentă')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={disabled}
              onClick={() => {
                onRollback(shown.number)
                setComparison(undefined)
              }}
            >
              <RotateCcw className="size-4" />
              {text('Restore this version', 'Restaurează această versiune')}
            </Button>
          </div>
        </div>
      )}
      {appearance && (
        <section
          className="space-y-4 rounded-md border p-4"
          aria-label={text('Video appearance', 'Aspect video')}
        >
          <StoryAppearance
            options={styleOptions}
            disabled={disabled}
            onChange={setStyleOptions}
            allowToggle
          />
          <Button
            size="sm"
            disabled={disabled || comparing}
            onClick={() => onRestyle(styleOptions)}
          >
            {text('Apply appearance', 'Aplică aspectul')}
          </Button>
        </section>
      )}
      <StoryReview
        version={shown}
        onSeek={shown.preview_url ? seekTo : undefined}
      />
      {editing && (
        <StoryClipEditor
          project={project}
          version={shown}
          disabled={disabled || comparing}
          onAction={onAction}
          onLock={onLock}
          onSeek={seekTo}
        />
      )}
      {shown.output?.music && (
        <StoryMusicCredits key={shown.number} music={shown.output.music} />
      )}
    </section>
  )
}
