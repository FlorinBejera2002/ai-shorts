import type { StoryAsset, StoryTranscriptApproval } from './types'
import { StoryTranscriptAsset } from './story-transcript-asset'
import { useStoryLanguage } from './use-story-language'
import './story-output.css'

export function StoryTranscriptReview({
  assets,
  disabled,
  onApprove,
  onRenew
}: {
  assets: StoryAsset[]
  disabled: boolean
  onApprove: (
    reviews: StoryTranscriptApproval[]
  ) => Promise<boolean | undefined>
  onRenew?: (assetID: string) => Promise<StoryAsset | undefined>
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
      className="story-transcript-review"
    >
      <h3>
        {text('Review transcripts', 'Verifică transcrierile')}
      </h3>
      <p className="story-output-hint">
        {text(
          'Check the recording. Confirmation saves the reviewed text without generating a video or using credits.',
          'Verifică înregistrarea. Confirmarea salvează textul verificat fără să genereze un video sau să consume credite.'
        )}
      </p>
      <p className="text-xs text-muted-foreground">
        {text(
          'Play the full recording or select a word timestamp to listen from that point.',
          'Redă înregistrarea completă sau alege timpul unui cuvânt pentru a asculta de acolo.'
        )}
        {disabled && ' ' + text(
          'You can listen while processing continues. Editing and confirmation become available when it finishes.',
          'Poți asculta în timpul procesării. Editarea și confirmarea devin disponibile când aceasta se termină.'
        )}
      </p>
      {reviewable.map((asset) => (
        <StoryTranscriptAsset
          key={asset.id}
          asset={asset}
          disabled={disabled}
          onApprove={onApprove}
          onRenew={onRenew}
        />
      ))}
    </section>
  )
}
