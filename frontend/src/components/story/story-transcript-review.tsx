import type { StoryAsset, StoryTranscriptApproval } from './types'
import { StoryTranscriptAsset } from './story-transcript-asset'
import { useStoryLanguage } from './use-story-language'

export function StoryTranscriptReview({
  assets,
  disabled,
  onApprove
}: {
  assets: StoryAsset[]
  disabled: boolean
  onApprove: (
    reviews: StoryTranscriptApproval[]
  ) => Promise<boolean | undefined>
}) {
  const text = useStoryLanguage()
  const reviewable = assets.filter(
    (asset) => asset.transcript_proposals?.length
  )
  if (!reviewable.length) return null
  return (
    <section
      id="story-transcript-review"
      aria-label={text('Review transcripts', 'Verifică transcrierile')}
      className="space-y-3 rounded-md border p-4"
    >
      <h3 className="text-sm font-medium">
        {text('Review transcripts', 'Verifică transcrierile')}
      </h3>
      <p className="text-sm text-muted-foreground">
        {text(
          'Check the words against each recording and confirm the passages you want to use. Confirmation saves the reviewed text without starting generation or using credits. When you are ready, generate or retry the story.',
          'Verifică textul ascultând fiecare înregistrare și confirmă pasajele dorite. Confirmarea salvează textul verificat fără să pornească generarea sau să consume credite. Când ești gata, generează povestea sau reîncearcă.'
        )}
      </p>
      {reviewable.map((asset) => (
        <StoryTranscriptAsset
          key={asset.id}
          asset={asset}
          disabled={disabled}
          onApprove={onApprove}
        />
      ))}
    </section>
  )
}
