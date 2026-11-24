import { useMemo, type ReactNode } from 'react'
import { StoryDescriptionCard } from './story-description-card'
import { storyFootage } from './story-footage'
import { StoryMusic } from './story-music'
import { StoryOptionsInspector } from './story-options-inspector'
import { StoryOptionsPreview } from './story-options-preview'
import type { StoryAsset, StoryOptions } from './types'
import { useStoryAppearance } from './use-story-appearance'
import styles from './story-options.module.css'

interface Props {
  options: StoryOptions
  /** Every asset of the project; narration recordings are ignored. */
  footage: StoryAsset[]
  disabled: boolean
  active?: boolean
  hasNarration?: boolean
  /** The narration card, rendered at the top of the work column when the project has one. */
  narration?: ReactNode
  onMusicPending?: (pending: boolean) => void
  onChange: (options: StoryOptions) => void
}

/**
 * The "Alege rezultatul" step. On desktop an inspector sits on the left and the preview, the
 * narration, the description and the music sit in the work column on the right. On mobile the
 * preview comes first, then the inspector, then the work column.
 */
export function StoryOptionsPanel({
  options,
  footage,
  disabled,
  active = true,
  hasNarration = false,
  narration,
  onMusicPending,
  onChange
}: Props) {
  const appearance = useStoryAppearance(options)
  const orderedFootage = useMemo(() => storyFootage(footage), [footage])

  return (
    <div className={styles.composition}>
      <div className={styles.preview}>
        <StoryOptionsPreview
          footage={orderedFootage}
          options={options}
          appearance={appearance}
          disabled={disabled}
          onChange={onChange}
        />
      </div>
      <fieldset disabled={disabled} className={`${styles.fieldsetReset} ${styles.inspector}`}>
        <StoryOptionsInspector
          options={options}
          footage={orderedFootage}
          hasNarration={hasNarration}
          appearance={appearance}
          onChange={onChange}
        />
      </fieldset>
      <div className={styles.work}>
        {narration}
        <fieldset disabled={disabled} className={styles.fieldsetReset}>
          <StoryDescriptionCard
            brief={options.brief}
            footage={orderedFootage}
            disabled={disabled}
            onChange={(brief) => onChange({ ...options, brief })}
          />
        </fieldset>
        <StoryMusic
          value={options.music}
          narration={Boolean(options.narration)}
          disabled={disabled}
          active={active}
          onChange={(music) => onChange({ ...options, music })}
          onPending={onMusicPending}
        />
      </div>
    </div>
  )
}
