import { FileVideo } from 'lucide-react'
import type { StoryAsset } from './types'
import { useStoryLanguage } from './use-story-language'

/** Phone-sized preview of the review: the first included footage frame, or a placeholder. */
export function StoryReviewPhone({ asset }: { asset?: StoryAsset }) {
  const text = useStoryLanguage()
  return (
    <figure className="creare-review-phone" aria-label={text('Clip preview', 'Previzualizarea clipului')}>
      {asset?.thumbnail_url ? (
        <img src={asset.thumbnail_url} alt="" />
      ) : (
        <span className="creare-review-phone-empty">
          <FileVideo className="size-8" aria-hidden="true" />
        </span>
      )}
    </figure>
  )
}
