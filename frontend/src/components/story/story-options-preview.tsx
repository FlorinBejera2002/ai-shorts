import { KitAvatar } from '@/components/dashboard/brand/kits/kit-visuals'
import { orderKits } from '@/components/dashboard/brand/kits/kit-model'
import { useBrandKits } from '@/components/dashboard/brand/kits/use-brand-kits'
import { StoryAppearancePreview } from './story-appearance'
import type { StoryAsset, StoryOptions } from './types'
import type { StoryAppearanceState } from './use-story-appearance'
import { useStoryLanguage } from './use-story-language'
import styles from './story-options.module.css'

interface Props {
  /** Footage in order; the first clip's frame is the poster of the phone preview. */
  footage: StoryAsset[]
  options: StoryOptions
  appearance: StoryAppearanceState
  disabled: boolean
  onChange: (options: StoryOptions) => void
}

/**
 * Phone-sized preview of the current choices: the first footage frame with a caption sample and
 * the brand kit mark. While the caption style is being edited, the live caption preview takes its
 * place.
 */
export function StoryOptionsPreview({ footage, options, appearance, disabled, onChange }: Props) {
  const text = useStoryLanguage()
  const { kits } = useBrandKits()
  const kit = options.use_brand_kit && kits ? orderKits(kits)[0] : undefined

  return (
    <section className={`${styles.card} ${styles.previewCard}`} aria-label={text('Preview', 'Previzualizarea clipului')}>
      <div className={styles.frame}>
        {appearance.visible ? (
          <StoryAppearancePreview
            options={options}
            disabled={disabled}
            appearance={appearance}
            onChange={onChange}
          />
        ) : (
          <>
            <PosterFrame asset={footage[0]} />
            {kit && (
              <span className={styles.frameKitDot} aria-hidden="true">
                <KitAvatar kit={kit} size={30} />
              </span>
            )}
            <p className={styles.caption}>
              {text('Six months ago I had ', 'Acum șase luni aveam ')}
              <span className={styles.captionAccent}>200</span>
              {text(' followers', ' de urmăritori')}
            </p>
          </>
        )}
      </div>
    </section>
  )
}

/** The first clip's thumbnail, or its own first frame when no thumbnail exists yet. */
function PosterFrame({ asset }: { asset?: StoryAsset }) {
  const source = asset?.proxy_url || asset?.source_url
  if (asset?.thumbnail_url)
    return <img className={styles.poster} src={asset.thumbnail_url} alt="" />
  if (source)
    return (
      <video
        className={styles.poster}
        src={source}
        muted
        playsInline
        preload="metadata"
        aria-hidden="true"
      />
    )
  return <span className={styles.framePlaceholder} aria-hidden="true" />
}
