import { Film, LockKeyhole, Play } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatDuration } from '@/lib/youtube'
import type {
  StoryAsset,
  StoryBlock,
  StoryProject,
  StoryVersion
} from './types'
import { useStoryLanguage } from './use-story-language'

interface Props {
  project: StoryProject
  version: StoryVersion
  block: StoryBlock
  index: number
  disabled: boolean
  onAction: (action: string, blockID?: string, candidateID?: string) => void
  onLock: (block: StoryBlock, patch: Partial<StoryBlock>) => void
  onSeek?: (seconds: number) => void
}

function narrationText(
  entry: StoryVersion['timeline'][number] | undefined,
  source: StoryAsset | undefined
) {
  if (!entry?.audio) return ''
  if (entry.words?.length) return entry.words.map((word) => word.text).join(' ')
  const interval = entry.audio
  const words = (source?.candidates ?? [])
    .flatMap((candidate) => candidate.words ?? [])
    .filter((word) => word.end > interval.in && word.start < interval.out)
    .sort((a, b) => a.start - b.start || a.end - b.end)
  const unique = new Map(
    words.map((word) => [`${word.start}:${word.end}:${word.text}`, word])
  )
  return [...unique.values()].map((word) => word.text).join(' ')
}

export function StoryScene({
  project,
  version,
  block,
  index,
  disabled,
  onAction,
  onLock,
  onSeek
}: Props) {
  const text = useStoryLanguage()
  const narration = Boolean(project.options.narration)
  const candidates = new Map(
    project.assets
      .flatMap((asset) => asset.candidates ?? [])
      .map((candidate) => [candidate.id, candidate])
  )
  const assets = new Map(project.assets.map((asset) => [asset.id, asset]))
  const candidate = candidates.get(block.candidate_id)
  const entry = version.timeline.find((item) => item.block_id === block.id)
  const audio = narration ? entry?.audio : candidate
  const source = audio && assets.get(audio.source_id)
  const visual = entry
    ? assets.get(entry.video.source_id)
    : candidate && assets.get(candidate.source_id)
  const transcript = narration ? narrationText(entry, source) : candidate?.text
  const alternatives = (block.alternatives ?? [])
    .map((id) => candidates.get(id))
    .filter((item) => item !== undefined)
  const alternativeLabel = narration
    ? text('Use another shot', 'Folosește alt cadru')
    : text('Use another take', 'Folosește altă dublă')
  const sceneLabel = `${text('Scene', 'Scena')} ${index + 1}`
  const title = transcript || text('Original footage', 'Imagini originale')

  return (
    <li className="rounded-md border p-3" data-testid="story-block">
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-16 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-muted">
          {visual?.thumbnail_url ? (
            <img
              src={visual.thumbnail_url}
              alt=""
              className="h-full w-full object-cover"
              loading="lazy"
            />
          ) : (
            <Film className="size-5 text-muted-foreground" aria-hidden="true" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{sceneLabel}</p>
          <p className="truncate text-xs text-muted-foreground" title={title}>
            {title}
          </p>
        </div>
        {entry && (
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0 tabular-nums"
            disabled={!onSeek}
            aria-label={`${text('View', 'Vezi')} ${sceneLabel.toLowerCase()} · ${formatDuration(entry.output_in)}–${formatDuration(entry.output_out)}`}
            onClick={() => onSeek?.(entry.output_in)}
          >
            <Play className="size-3.5" aria-hidden="true" />
            {formatDuration(entry.output_in)}–{formatDuration(entry.output_out)}
          </Button>
        )}
      </div>
      <details className="mt-1 sm:pl-19">
        <summary className="cursor-pointer text-xs font-medium">
          {text(
            'Scene details and changes',
            'Detalii și modificări ale scenei'
          )}{' '}
          {index + 1}
        </summary>
        <div className="space-y-3 pt-3">
          {(transcript || narration) && (
            <p className="whitespace-pre-wrap text-sm leading-relaxed">
              {transcript ||
                text(
                  'Listen to the narration for this section.',
                  'Ascultă narațiunea acestei secțiuni.'
                )}
            </p>
          )}
          {source && audio && (
            <p className="text-xs text-muted-foreground">
              {narration
                ? text('Your narration', 'Narațiunea ta')
                : text('Original recording', 'Înregistrarea originală')}
              :{' '}
              {source.source_url ? (
                <a
                  className="underline underline-offset-2"
                  href={`${source.source_url}#t=${audio.in},${audio.out}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {source.name}
                </a>
              ) : (
                source.name
              )}{' '}
              · {formatDuration(audio.in)}–{formatDuration(audio.out)}
            </p>
          )}
          {visual && entry && (narration || visual.id !== source?.id) && (
            <p className="text-xs text-muted-foreground">
              {text('Visual source', 'Sursă imagine')}:{' '}
              {visual.source_url ? (
                <a
                  className="underline underline-offset-2"
                  href={`${visual.source_url}#t=${entry.video.in},${entry.video.out}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {visual.name}
                </a>
              ) : (
                visual.name
              )}{' '}
              · {formatDuration(entry.video.in)}–
              {formatDuration(entry.video.out)}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={disabled || block.locked}
              onClick={() => onAction('regenerate_section', block.id)}
            >
              {text('Rework this scene', 'Refă această scenă')}
            </Button>
            {alternatives.length > 0 && (
              <label className="min-w-0 flex-1 text-xs">
                <span className="sr-only">
                  {alternativeLabel} {index + 1}
                </span>
                <select
                  className="story-select"
                  aria-label={`${alternativeLabel} ${index + 1}`}
                  disabled={
                    disabled || block.locked || (!narration && block.lock_text)
                  }
                  value=""
                  onChange={(event) => {
                    if (event.target.value)
                      onAction('alternate', block.id, event.target.value)
                  }}
                >
                  <option value="">{alternativeLabel}…</option>
                  {alternatives.map((alternative) => (
                    <option key={alternative.id} value={alternative.id}>
                      {assets.get(alternative.source_id)?.name} ·{' '}
                      {formatDuration(alternative.in)}
                      {!narration && alternative.text
                        ? ` · ${alternative.text.slice(0, 70)}`
                        : ''}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <fieldset disabled={disabled} className="space-y-2">
            <legend className="flex items-center gap-2 text-xs font-medium">
              <LockKeyhole className="size-3.5" aria-hidden="true" />
              {text(
                'Keep unchanged in future edits',
                'Păstrează neschimbat la editările viitoare'
              )}
            </legend>
            <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs">
              {(
                [
                  ['locked', text('Entire scene', 'Întreaga scenă')],
                  [
                    'lock_text',
                    transcript
                      ? text('Spoken words', 'Cuvintele rostite')
                      : text('Selected clip', 'Clipul selectat')
                  ],
                  ['lock_order', text('Scene position', 'Poziția scenei')],
                  ['lock_crop', text('Framing', 'Încadrare')]
                ] as const
              )
                .filter(([key]) => !narration || key !== 'lock_text')
                .map(([key, label]) => (
                  <label key={key} className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      className="accent-foreground"
                      checked={block[key]}
                      onChange={(event) =>
                        onLock(block, { [key]: event.target.checked })
                      }
                    />
                    {label}
                  </label>
                ))}
            </div>
          </fieldset>
        </div>
      </details>
    </li>
  )
}
