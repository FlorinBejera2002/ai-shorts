import { Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatDuration } from '@/lib/youtube'
import { storyCaptionMode, type StoryAsset, type StoryOptions } from './types'
import type { StoryStep } from './story-wizard'
import { useStoryLanguage } from './use-story-language'
import { StoryMusicSummary } from './story-music-summary'

interface Props {
  options: StoryOptions
  videos: StoryAsset[]
  narration?: StoryAsset

  ready: boolean
  busy: boolean
  pendingCount: number

  onEdit: (step: StoryStep) => void
  onCreate: () => void
}

export function StoryCreateReview({
  options,
  videos,
  narration,

  ready,
  busy,
  pendingCount,

  onEdit,
  onCreate
}: Props) {
  const text = useStoryLanguage()
  const captionLabels = {
    all: text('All dialogue', 'Pe tot dialogul'),
    selective: text('Only hard-to-hear speech', 'Doar unde se aude greu'),
    off: text('No captions', 'Fără subtitrări')
  }
  const included = videos.filter((asset) => asset.include !== 'excluded')

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 border-b pb-4">
        <span className="text-sm font-medium">
          {included.length}{' '}
          {included.length === 1
            ? text('clip selected', 'filmare selectată')
            : text('clips selected', 'filmări selectate')}
        </span>
        <Button
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() => onEdit(0)}
        >
          <Pencil />
          {text('Edit clips', 'Schimbă filmările')}
        </Button>
      </div>
      <details>
        <summary className="cursor-pointer text-sm text-muted-foreground">
          {text('View selected clips', 'Vezi filmările selectate')}
        </summary>
        <ol className="max-h-60 divide-y overflow-y-auto text-sm">
          {included.map((asset) => (
            <li
              key={asset.id}
              className="flex min-w-0 items-center justify-between gap-4 py-2"
            >
              <span className="truncate" title={asset.name}>
                {asset.name}
              </span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {formatDuration(asset.duration)}
              </span>
            </li>
          ))}
        </ol>
      </details>
      {(!included.length || pendingCount > 0) && (
        <p role="status" className="text-sm text-muted-foreground">
          {pendingCount > 0
            ? text(
                'Finish or retry the remaining uploads to continue.',
                'Finalizează sau reîncearcă încărcările rămase pentru a continua.'
              )
            : text(
                'Include at least one clip to continue.',
                'Include cel puțin o filmare pentru a continua.'
              )}
        </p>
      )}
      <div className="space-y-3 border-t pt-4">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-medium">
            {text('Your direction', 'Indicațiile tale')}
          </span>
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => onEdit(1)}
          >
            <Pencil />
            {text('Edit direction', 'Schimbă instrucțiunile')}
          </Button>
        </div>
        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
          {options.brief.trim() ||
            text(
              'A natural edit faithful to your recordings.',
              'Un montaj natural, fidel filmărilor tale.'
            )}
        </p>
        <p className="break-words text-sm text-muted-foreground">
          {options.narration && narration
            ? `${narration.name} · ${formatDuration(narration.duration)}`
            : text('Original audio', 'Sunet original')}
        </p>
        {options.music && <StoryMusicSummary music={options.music} />}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        <p className="text-sm">
          {captionLabels[storyCaptionMode(options)]} · {options.aspect_ratio} ·{' '}
          {options.narration
            ? text('Full narration', 'Narațiunea completă')
            : `≈ ${options.target_seconds} s`}
          {!options.narration &&
            ` · ${options.preserve_order ? text('Original order', 'Ordinea originală') : text('AI sequence', 'Ordine aleasă de AI')}`}
        </p>
        <Button
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() => onEdit(1)}
        >
          <Pencil />
          {text('Edit options', 'Schimbă opțiunile')}
        </Button>
      </div>
      <div className="space-y-4 border-t pt-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm text-muted-foreground">
            {text('10 credits · charged once', '10 credite · o singură plată')}
          </span>
          <Button
            className="w-full sm:w-auto"
            disabled={!ready || busy}
            onClick={onCreate}
          >
            {busy
              ? text('Submitting…', 'Se trimite…')
              : text('Build my story', 'Creează povestea')}
          </Button>
        </div>
      </div>
    </div>
  )
}
