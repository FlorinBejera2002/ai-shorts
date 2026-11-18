import { Button } from '@/components/ui/button'
import { useStoryLanguage } from './use-story-language'

export function StoryMusicRecovery({
  disabled,
  onRetry,
  onSettings
}: {
  disabled: boolean
  onRetry?: () => void
  onSettings: () => void
}) {
  const text = useStoryLanguage()
  return (
    <section className="space-y-3 rounded-md border p-4" data-testid="music-recovery">
      <p className="text-sm">
        {text(
          'Your music and clips are saved. Retry analysis, or turn off Follow the music in settings to keep the soundtrack without using it to guide pacing and transitions.',
          'Muzica și filmările sunt salvate. Reîncearcă analiza sau dezactivează Urmărește muzica în setări pentru a păstra piesa fără a o folosi pentru ritmul montajului și tranziții.'
        )}
      </p>
      <div className="flex flex-wrap gap-2">
        {onRetry && (
          <Button type="button" variant="outline" disabled={disabled} onClick={onRetry}>
            {text('Retry music analysis', 'Reîncearcă analiza muzicii')}
          </Button>
        )}
        <Button type="button" variant="outline" disabled={disabled} onClick={onSettings}>
          {text('Review music settings', 'Verifică setările muzicii')}
        </Button>
      </div>
    </section>
  )
}
