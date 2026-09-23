import { useRef } from 'react'
import { LockKeyhole, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { formatDuration } from '@/lib/youtube'
import type { StoryAsset, StoryBlock, StoryProject, StoryVersion } from './types'
import { StoryReview } from './story-review'
import { useStoryLanguage } from './use-story-language'

interface Props {
  project: StoryProject
  version: StoryVersion
  disabled: boolean
  onAction: (action: string, blockID?: string, candidateID?: string) => void
  onLock: (block: StoryBlock, patch: Partial<StoryBlock>) => void
  onRollback: (version: number) => void
}

function narrationText(entry: StoryVersion['timeline'][number] | undefined, source: StoryAsset | undefined) {
  if (!entry?.audio) return ''
  if (entry.words?.length) return entry.words.map((word) => word.text).join(' ')
  const interval = entry.audio
  const words = (source?.candidates ?? [])
    .flatMap((candidate) => candidate.words ?? [])
    .filter((word) => word.end > interval.in && word.start < interval.out)
    .sort((a, b) => a.start - b.start || a.end - b.end)
  const unique = new Map(words.map((word) => [`${word.start}:${word.end}:${word.text}`, word]))
  return [...unique.values()].map((word) => word.text).join(' ')
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
  const narration = Boolean(project.options.narration)
  const alternativeLabel = narration
    ? text('Use another shot', 'Folosește alt cadru')
    : text('Use another take', 'Folosește altă dublă')
  const candidates = new Map(
    (project.assets ?? [])
      .flatMap((asset) => asset.candidates ?? [])
      .map((candidate) => [candidate.id, candidate])
  )
  const assets = new Map(project.assets.map((asset) => [asset.id, asset]))
  const oldVersions = (project.versions ?? []).filter(
    (item) => item.accepted && item.number !== version.number
  )
  return (
    <div className="space-y-5">
      <Card className="block space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">
              {version.plan.title || text('Your story', 'Povestea ta')}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Natural · {text('Version', 'Versiunea')} {version.number}
            </p>
          </div>
          {version.preview_url && (
            <Button asChild variant="outline" size="sm">
              <a href={version.preview_url} download target="_blank" rel="noreferrer">
                {version.report.status === 'ready'
                  ? text('Download', 'Descarcă')
                  : text('Download draft', 'Descarcă draft')}
              </a>
            </Button>
          )}
        </div>
        {version.preview_url ? (
          <video
            ref={video}
            src={version.preview_url}
            poster={version.thumbnail_url}
            controls
            playsInline
            preload="metadata"
            className="max-h-[34rem] w-full rounded-md bg-black"
            aria-label={text('Story preview', 'Previzualizare poveste')}
          />
        ) : (
          <p className="rounded-md bg-muted p-4 text-sm">
            {text(
              'A playable preview is not available for this version.',
              'Nu există o previzualizare redabilă pentru această versiune.'
            )}
          </p>
        )}
        <p className="text-sm text-muted-foreground">{version.plan.summary}</p>
        {(version.plan.gaps ?? []).length > 0 && (
          <div className="space-y-2 rounded-md border p-3">
            <h3 className="text-sm font-medium">
              {text('Missing from your recordings', 'Ce lipsește din filmări')}
            </h3>
            {version.plan.gaps?.map((gap, index) => (
              <p key={`${index}-${gap}`} className="text-sm text-muted-foreground">
                {gap}
              </p>
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {!narration && <Button
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={() => onAction('faster')}
          >
            {text('Make this faster', 'Fă-l mai rapid')}
          </Button>}
          <Button
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={() => onAction('improve_flow')}
          >
            {text('Improve flow', 'Îmbunătățește cursivitatea')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={() => onAction('improve_transitions')}
          >
            {text('Improve transitions', 'Îmbunătățește tranzițiile')}
          </Button>
        </div>
        {oldVersions.length > 0 && (
          <label className="block space-y-2 text-sm">
            <span className="flex items-center gap-2">
              <RotateCcw className="size-4" />
              {text('Restore a previous version', 'Revino la o versiune anterioară')}
            </span>
            <select
              className="story-select"
              aria-label={text('Restore version', 'Restaurează versiunea')}
              value=""
              disabled={disabled}
              onChange={(event) => {
                if (event.target.value) onRollback(Number(event.target.value))
              }}
            >
              <option value="">
                {text('Choose a saved version…', 'Alege o versiune salvată…')}
              </option>
              {oldVersions.map((item) => (
                <option key={item.number} value={item.number}>
                  {text('Version', 'Versiunea')} {item.number} ·{' '}
                  {item.report.status === 'ready'
                    ? text('Ready', 'Pregătită')
                    : text('Needs review', 'Necesită revizie')}
                </option>
              ))}
            </select>
          </label>
        )}
      </Card>
      <Card className="block space-y-4 p-5">
        <div>
          <h2 className="font-semibold">
            {text('Story timeline', 'Cronologia poveștii')}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {narration ? text(
              'Your narration stays unchanged. Each section links to its voice recording and the footage shown.',
              'Narațiunea rămâne neschimbată. Fiecare secțiune trimite la înregistrarea vocii și la imaginile afișate.'
            ) : text(
              'Every selected sentence links to its original recording. Locks apply to future edits.',
              'Fiecare frază selectată trimite la filmarea originală. Blocările se aplică editărilor viitoare.'
            )}
          </p>
        </div>
        <ol className="space-y-4">
          {version.plan.blocks.map((block, index) => {
            const candidate = candidates.get(block.candidate_id)
            const entry = version.timeline?.find((item) => item.block_id === block.id)
            const audio = narration ? entry?.audio : candidate
            const source = audio && assets.get(audio.source_id)
            const visual = entry && assets.get(entry.video.source_id)
            const transcript = narration ? narrationText(entry, source) : candidate?.text
            const uncertainTranscript = narration
              ? (source?.candidates ?? []).some((item) => audio && item.out > audio.in && item.in < audio.out && item.confidence < 0.7)
              : candidate && candidate.confidence < 0.7
            const alternatives = (block.alternatives ?? [])
              .map((id) => candidates.get(id))
              .filter((item) => item !== undefined)
            return (
              <li
                key={block.id}
                className="space-y-3 rounded-md border p-4"
                data-testid="story-block"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="rounded-sm bg-muted px-2 py-1">
                    {index + 1} · {block.role}
                  </span>
                  {entry && (
                    <button
                      className="rounded-sm px-2 py-1 tabular-nums hover:bg-muted"
                      type="button"
                      onClick={() => {
                        if (video.current) video.current.currentTime = entry.output_in
                      }}
                    >
                      {formatDuration(entry.output_in)}–
                      {formatDuration(entry.output_out)}
                    </button>
                  )}
                </div>
                <p className="whitespace-pre-wrap text-sm leading-relaxed">
                  {transcript || (narration
                    ? text('Listen to the narration for this section.', 'Ascultă narațiunea acestei secțiuni.')
                    : text('Supporting visual', 'Imagine de susținere'))}
                </p>
                {source && audio && (
                  <div className="text-xs text-muted-foreground">
                    {narration
                      ? text('Your narration', 'Narațiunea ta')
                      : text(
                          'Original audio / selected take',
                          'Audio original / dublă selectată'
                        )}
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
                  </div>
                )}
                {visual && entry && (narration || entry.audio?.source_id !== entry.video.source_id) && (
                  <p className="text-xs text-muted-foreground">
                    {text('Visual source', 'Sursă imagine')}: {narration && visual.source_url ? <a
                      className="underline underline-offset-2"
                      href={`${visual.source_url}#t=${entry.video.in},${entry.video.out}`}
                      target="_blank"
                      rel="noreferrer"
                    >{visual.name}</a> : visual.name} ·{' '}
                    {formatDuration(entry.video.in)}–{formatDuration(entry.video.out)}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  {block.reason || candidate?.reason}
                </p>
                {uncertainTranscript && (
                  <p className="text-xs text-muted-foreground">
                    {text(
                      'Uncertain transcript: listen to the original before relying on this selection.',
                      'Transcriere incertă: ascultă originalul înainte să te bazezi pe această selecție.'
                    )}
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={disabled || block.locked}
                    onClick={() => onAction('regenerate_section', block.id)}
                  >
                    {text('Regenerate this section', 'Regenerează secțiunea')}
                  </Button>
                  {alternatives.length > 0 && (
                    <label className="min-w-0 flex-1 text-xs">
                      <span className="sr-only">
                        {alternativeLabel} {index + 1}
                      </span>
                      <select
                        className="story-select"
                        aria-label={`${alternativeLabel} ${index + 1}`}
                        disabled={disabled || block.locked || (!narration && block.lock_text)}
                        value=""
                        onChange={(event) => {
                          if (event.target.value)
                            onAction('alternate', block.id, event.target.value)
                        }}
                      >
                        <option value="">
                          {alternativeLabel}…
                        </option>
                        {alternatives.map((alternative) => (
                          <option key={alternative.id} value={alternative.id}>
                            {assets.get(alternative.source_id)?.name} ·{' '}
                            {formatDuration(alternative.in)} ·{' '}
                            {(narration ? alternative.reason : alternative.text).slice(0, 70)}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>
                <fieldset
                  disabled={disabled}
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs"
                >
                  <legend className="sr-only">
                    {text('Section locks', 'Blocările secțiunii')} {index + 1}
                  </legend>
                  <LockKeyhole className="size-3.5" aria-hidden="true" />
                  {(
                    [
                      ['locked', text('Entire section', 'Întreaga secțiune')],
                      ['lock_text', text('Words', 'Cuvinte')],
                      ['lock_order', text('Order', 'Ordine')],
                      ['lock_crop', text('Framing', 'Încadrare')]
                    ] as const
                  ).filter(([key]) => !narration || key !== 'lock_text').map(([key, label]) => (
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
                </fieldset>
              </li>
            )
          })}
        </ol>
      </Card>
      <StoryReview version={version} attempts={project.attempts} />
    </div>
  )
}
