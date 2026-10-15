import type { StoryOptions, StoryVersion } from './types'
import { storyCaptionMode } from './types'
import { useStoryLanguage } from './use-story-language'

export function StoryCaptionStatus({
  version,
  options,
  hasTranscriptProposals = false
}: {
  version: StoryVersion
  options: StoryOptions
  hasTranscriptProposals?: boolean
}) {
  const text = useStoryLanguage()
  const mode = storyCaptionMode(version.render_options ?? options)
  // Selective mode may legitimately find no speech needing captions. Existing
  // caption warnings are already shown by StoryReview with a retry action hint.
  if (
    mode !== 'all' ||
    version.output?.captions !== false ||
    version.output.caption_warnings?.length
  )
    return null
  return (
    <p
      role="status"
      className="rounded-md border p-3 text-sm"
      data-testid="story-caption-status"
    >
      {hasTranscriptProposals ? (
        <>
          {text(
            'This version has no captions. Review the proposed transcripts and confirm the words against the source audio before rebuilding.',
            'Această versiune nu are subtitrări. Verifică transcrierile propuse și confirmă cuvintele ascultând sunetul original înainte de regenerare.'
          )}{' '}
          <a
            href="#story-transcript-review"
            className="underline underline-offset-2"
          >
            {text('Review transcripts', 'Verifică transcrierile')}
          </a>
        </>
      ) : (
        text(
          'This version has no captions. No usable speech transcript was available for the selected clips. Check the source audio and regenerate, or turn captions off in Appearance.',
          'Această versiune nu are subtitrări. Nu a fost disponibilă o transcriere utilizabilă pentru filmările selectate. Verifică sunetul original și regenerează sau dezactivează subtitrările din Aspect.'
        )
      )}
    </p>
  )
}
