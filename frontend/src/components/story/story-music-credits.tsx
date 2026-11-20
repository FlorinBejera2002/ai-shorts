import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from '@/lib/toast'
import type { StoryMusicOutput } from './types'
import { useStoryLanguage } from './use-story-language'

function musicTimingDescription(
  music: StoryMusicOutput,
  text: (english: string, romanian: string) => string
) {
  const syncCopy = {
    aligned: text(
      'The music guided the edit while preserving complete actions and retained speech.',
      'Muzica a ghidat montajul, păstrând acțiunile complete și vorbirea selectată.'
    ),
    partial: text(
      'The music guided parts of the edit. Other moments stayed unchanged to protect speech and complete actions.',
      'Muzica a ghidat părți ale montajului. Alte momente au rămas neschimbate pentru a proteja vorbirea și acțiunile complete.'
    ),
    unchanged: text(
      'The original timing was preserved where music evidence or content constraints did not support a safe change.',
      'Momentele originale au fost păstrate unde analiza muzicii sau conținutul nu au permis o schimbare sigură.'
    ),
    off: text('Existing cut timing was kept.', 'Momentele tăieturilor au fost păstrate.')
  }
  const details = [music.explanation || syncCopy[music.sync_status]]
  if (music.adjusted_cuts > 0) {
    details.push(`${music.adjusted_cuts} ${text('cuts adjusted.', 'tăieturi ajustate.')}`)
  }
  if ((music.aligned_cuts ?? 0) > 0) {
    details.push(`${music.aligned_cuts} ${text('cuts aligned to measured rhythmic accents.', 'tăieturi aliniate la accente ritmice măsurate.')}`)
  }
  return details.join(' ')
}

export function StoryMusicCredits({ music }: { music: StoryMusicOutput }) {
  const text = useStoryLanguage()
  const heading = music.attribution
    ? text('Music credits', 'Credite muzicale')
    : text('Music', 'Muzică')
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(music.attribution)
      setCopied(true)
      toast.success(text('Music credits copied.', 'Creditele muzicale au fost copiate.'))
    } catch {
      setCopied(false)
      toast.error(
        text(
          'Copy was unavailable. Select and copy the credits above.',
          'Copierea nu este disponibilă. Selectează și copiază creditele de mai sus.'
        )
      )
    }
  }

  return (
    <section className="space-y-3 border-t pt-4" aria-label={heading}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{heading}</h2>
        {music.attribution && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void copy()}
          >
            {copied ? (
              <Check aria-hidden="true" />
            ) : (
              <Copy aria-hidden="true" />
            )}
            {copied
              ? text('Credits copied', 'Credite copiate')
              : text('Copy music credits', 'Copiază creditele muzicale')}
          </Button>
        )}
      </div>
      <p className="break-words text-sm">
        {music.source_url ? (
          <a
            href={music.source_url}
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2"
          >
            {music.title}
          </a>
        ) : (
          music.title
        )}
        {music.artist ? ` · ${music.artist}` : ''}
        {music.license && (
          <>
            {' '}
            ·{' '}
            {music.license_url ? (
              <a
                href={music.license_url}
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-2"
              >
                {music.license}
              </a>
            ) : (
              music.license
            )}
          </>
        )}
      </p>
      <p className="text-xs leading-relaxed text-muted-foreground">
        {musicTimingDescription(music, text)}
      </p>
      {music.attribution && (
        <>
          <p className="text-xs text-muted-foreground">
            {text(
              'Add these credits to your post or video description when publishing.',
              'Adaugă aceste credite la postare sau în descrierea videoului când publici.'
            )}
          </p>
          <p
            className="select-text whitespace-pre-wrap break-words rounded-md bg-muted p-3 text-xs leading-relaxed"
            data-testid="music-attribution"
          >
            {music.attribution}
          </p>
        </>
      )}
    </section>
  )
}
