import type { StoryOptions, StoryVersion } from './types'
import { storyCaptionMode } from './types'
import { useStoryLanguage } from './use-story-language'

export function StoryCaptionStatus({
  version,
  options
}: {
  version: StoryVersion
  options: StoryOptions
}) {
  const text = useStoryLanguage()
  const mode = storyCaptionMode(version.render_options ?? options)
  // Selective mode may legitimately find no speech needing captions. Existing
  // Caption warnings are already shown by StoryReview.
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
      {text(
        'This version has no captions. Open the video in Studio to review the audio and add captions.',
        'Această versiune nu are subtitrări. Deschide videoul în Studio pentru a verifica sunetul și a adăuga subtitrări.'
      )}
    </p>
  )
}
