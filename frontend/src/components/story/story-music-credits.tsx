import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { StoryMusicOutput } from './types'
import { useStoryLanguage } from './use-story-language'

export function StoryMusicCredits({ music }: { music: StoryMusicOutput }) {
  const text = useStoryLanguage()
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'error'>('idle')
  const syncCopy = {
    aligned: text('The eligible cuts follow the music beat.', 'Tăieturile potrivite urmează ritmul muzicii.'),
    partial: text('Some cuts follow the beat. Other moments stay unchanged to protect the speech and scene boundaries.', 'Unele tăieturi urmează ritmul. Alte momente rămân neschimbate pentru a proteja vorbirea și limitele scenelor.'),
    unchanged: text('Cut timing stayed unchanged because no safe beat alignment was available.', 'Tăieturile au rămas neschimbate: nu s-a găsit o aliniere sigură cu ritmul.'),
    off: text('Existing cut timing was kept.', 'Momentele tăieturilor au fost păstrate.')
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(music.attribution)
      setCopyStatus('copied')
    } catch {
      setCopyStatus('error')
    }
  }

  return (
    <section className="space-y-3 border-t pt-4" aria-label={text('Music credits', 'Credite muzicale')}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{text('Music credits', 'Credite muzicale')}</h2>
        <Button type="button" variant="outline" size="sm" onClick={() => void copy()}>
          {copyStatus === 'copied' ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          {copyStatus === 'copied' ? text('Credits copied', 'Credite copiate') : text('Copy music credits', 'Copiază creditele muzicale')}
        </Button>
      </div>
      <p className="break-words text-sm">
        <a href={music.source_url} target="_blank" rel="noreferrer" className="underline underline-offset-2">{music.title}</a> · {music.artist} · <a href={music.license_url} target="_blank" rel="noreferrer" className="underline underline-offset-2">{music.license}</a>
      </p>
      <p className="text-xs leading-relaxed text-muted-foreground">
        {syncCopy[music.sync_status]}
        {music.adjusted_cuts > 0 ? ` ${music.adjusted_cuts} ${text('cuts adjusted.', 'tăieturi ajustate.')}` : ''}
      </p>
      <p className="text-xs text-muted-foreground">{text('Add these credits to your post or video description when publishing.', 'Adaugă aceste credite la postare sau în descrierea videoului când publici.')}</p>
      <p className="select-text whitespace-pre-wrap break-words rounded-md bg-muted p-3 text-xs leading-relaxed" data-testid="music-attribution">{music.attribution}</p>
      {copyStatus === 'copied' && <p role="status" className="sr-only">{text('Music credits copied.', 'Creditele muzicale au fost copiate.')}</p>}
      {copyStatus === 'error' && <p role="status" className="text-xs text-muted-foreground">{text('Copy was unavailable. Select and copy the credits above.', 'Copierea nu este disponibilă. Selectează și copiază creditele de mai sus.')}</p>}
    </section>
  )
}
