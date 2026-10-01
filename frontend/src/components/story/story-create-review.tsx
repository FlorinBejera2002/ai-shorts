import { Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { formatDuration } from '@/lib/youtube'
import type { StoryAsset, StoryOptions } from './types'
import type { StoryStep } from './story-wizard'
import { useStoryLanguage } from './use-story-language'
import { StoryHelp } from './story-help'

interface Props {
  options: StoryOptions
  videos: StoryAsset[]
  narration?: StoryAsset
  confirmed: boolean
  ready: boolean
  busy: boolean
  pendingCount: number
  onConfirm: (confirmed: boolean) => void
  onEdit: (step: StoryStep) => void
  onCreate: () => void
}

export function StoryCreateReview({
  options,
  videos,
  narration,
  confirmed,
  ready,
  busy,
  pendingCount,
  onConfirm,
  onEdit,
  onCreate
}: Props) {
  const text = useStoryLanguage()
  const formats: Record<string, string> = {
    '9:16': text('Portrait · 9:16', 'Vertical · 9:16'),
    '1:1': text('Square · 1:1', 'Pătrat · 1:1'),
    '16:9': text('Landscape · 16:9', 'Orizontal · 16:9')
  }
  return (
    <div className="story-confirmation-layout">
      <Card className="block space-y-5 p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-semibold">
            {text('Your clips', 'Filmările tale')}{' '}
            <span className="ml-1 font-normal text-muted-foreground">
              ({videos.length})
            </span>
          </h3>
          <Button
            variant="ghost"
            size="sm"
            className="focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2"
            disabled={busy}
            onClick={() => onEdit(0)}
          >
            <Pencil />
            {text('Edit clips', 'Schimbă filmările')}
          </Button>
        </div>
        {videos.length ? (
          <ul className="grid gap-2 text-sm sm:grid-cols-2">
            {videos.map((asset) => (
              <li key={asset.id} className="min-w-0 rounded-md bg-muted px-3 py-2">
                <p className="truncate" title={asset.name}>
                  {asset.name}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatDuration(asset.duration)}
                  {asset.include === 'excluded' && ` · ${text('Excluded', 'Exclus')}`}
                  {asset.include === 'required' &&
                    ` · ${text('Always include', 'Include obligatoriu')}`}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            {text(
              'Add at least one clip before creating your story.',
              'Adaugă cel puțin o filmare înainte de a crea povestea.'
            )}
          </p>
        )}
        {pendingCount > 0 && (
          <p role="status" className="text-sm text-muted-foreground">
            {text(
              'Some clips are still being prepared or need your attention. Check them before creating.',
              'Unele filmări încă se pregătesc sau necesită atenție. Verifică-le înainte de creare.'
            )}
          </p>
        )}
        {videos.length > 0 && videos.every((asset) => asset.include === 'excluded') && (
          <p role="status" className="text-sm text-muted-foreground">
            {text(
              'Include at least one clip before creating your story.',
              'Include cel puțin o filmare înainte de a crea povestea.'
            )}
          </p>
        )}
        <div className="border-t pt-5">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h3 className="font-semibold">
              {text('AI editing direction', 'Instrucțiuni pentru AI')}
            </h3>
            <Button
              variant="ghost"
              size="sm"
              className="focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2"
              disabled={busy}
              onClick={() => onEdit(1)}
            >
              <Pencil />
              {text('Edit direction', 'Schimbă instrucțiunile')}
            </Button>
          </div>
          {options.brief.trim() && (
            <p className="whitespace-pre-wrap text-sm leading-relaxed">
              {options.brief}
            </p>
          )}
          {!options.brief.trim() && (
            <p className="text-sm text-muted-foreground">
              {text(
                'AI will choose the strongest story automatically.',
                'AI-ul va alege automat cea mai bună poveste.'
              )}
            </p>
          )}
          <p className="mt-3 break-words text-sm text-muted-foreground">
            {options.narration
              ? narration
                ? `${text('Your narration', 'Narațiunea ta')}: ${narration.name} · ${formatDuration(narration.duration)}`
                : text(
                    'Save your narration before creating.',
                    'Salvează narațiunea înainte de creare.'
                  )
              : text(
                  'Sound from your original clips.',
                  'Sunetul filmărilor originale.'
                )}
          </p>
        </div>
        <div className="border-t pt-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="font-semibold">{text('Style', 'Aspect')}</h3>
            <Button
              variant="ghost"
              size="sm"
              className="focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2"
              disabled={busy}
              onClick={() => onEdit(2)}
            >
              <Pencil />
              {text('Edit style', 'Schimbă aspectul')}
            </Button>
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <div>
              <dt className="text-muted-foreground">{text('Format', 'Format')}</dt>
              <dd className="mt-1 font-medium">
                {formats[options.aspect_ratio] ?? options.aspect_ratio}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{text('Length', 'Durată')}</dt>
              <dd className="mt-1 font-medium">
                {options.narration
                  ? text('Full narration', 'Narațiunea completă')
                  : `${options.target_seconds} ${text('seconds', 'secunde')}`}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">
                {text('Captions', 'Subtitrări')}
              </dt>
              <dd className="mt-1 font-medium">
                {options.captions ? text('Included', 'Incluse') : text('Off', 'Oprite')}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">
                {text('Clip order', 'Ordinea filmărilor')}
              </dt>
              <dd className="mt-1 font-medium">
                {options.preserve_order
                  ? text('Your order', 'Ordinea ta')
                  : text('Arranged for your story', 'Potrivită poveștii')}
              </dd>
            </div>
          </dl>
        </div>
      </Card>
      <Card className="block space-y-5 p-5 sm:p-6">
        <div className="space-y-2 rounded-md bg-muted p-4">
          <div className="flex items-center gap-2">
            <p className="text-lg font-semibold">{text('10 credits', '10 credite')}</p>
            <StoryHelp label={text('About the cost', 'Despre cost')}>
              {text(
                'Includes the edit, quality checks and automatic improvements. Your original files stay available.',
                'Include montajul, verificarea calității și îmbunătățirile automate. Fișierele originale rămân disponibile.'
              )}
            </StoryHelp>
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {text('Charged once when you create.', 'Plătite o singură dată la creare.')}
          </p>
        </div>
        <label className="flex items-start gap-3 text-sm leading-relaxed">
          <input
            type="checkbox"
            className="mt-1 accent-foreground"
            checked={confirmed}
            disabled={!ready || busy}
            onChange={(event) => onConfirm(event.target.checked)}
          />
          {options.narration
            ? text(
                'My narration and all my clips are saved. Use this complete set.',
                'Narațiunea și toate filmările sunt salvate. Folosește acest set complet.'
              )
            : text(
                'All my clips are uploaded. Use this complete set.',
                'Am încărcat toate filmările. Folosește acest set complet.'
              )}
        </label>
        <Button
          className="w-full bg-foreground text-background hover:bg-foreground/90 focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2"
          disabled={!confirmed || !ready || busy}
          onClick={onCreate}
        >
          {busy
            ? text('Submitting…', 'Se trimite…')
            : text('Build my story', 'Creează povestea')}
        </Button>
      </Card>
    </div>
  )
}
