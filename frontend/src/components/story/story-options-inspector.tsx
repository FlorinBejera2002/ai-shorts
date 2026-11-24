import { StoryBrandKitField } from './story-brand-kit-field'
import { StoryClipCount } from './story-clip-count'
import { StoryFormat } from './story-format'
import { StoryMoreOptions } from './story-more-options'
import { StoryOptionSection } from './story-option-section'
import { StorySegmentedControl } from './story-segmented-control'
import { StorySoundOptions } from './story-sound-options'
import { storyCaptionMode, type StoryAsset, type StoryOptions } from './types'
import type { StoryAppearanceState } from './use-story-appearance'
import { useStoryLanguage } from './use-story-language'
import styles from './story-options.module.css'

const LENGTHS = [15, 30, 45, 60, 90] as const

interface Props {
  options: StoryOptions
  footage: StoryAsset[]
  hasNarration: boolean
  appearance: StoryAppearanceState
  onChange: (options: StoryOptions) => void
}

/** The compact left column: every choice that shapes the result, in reading order. */
export function StoryOptionsInspector({
  options,
  footage,
  hasNarration,
  appearance,
  onChange
}: Props) {
  const text = useStoryLanguage()
  const narrated = Boolean(options.narration)

  return (
    <div className={`${styles.card} ${styles.inspectorCard}`}>
      <StoryOptionSection title={text('Sound', 'Sunet')}>
        <StorySoundOptions
          options={options}
          footage={footage}
          hasNarration={hasNarration}
          onChange={onChange}
        />
      </StoryOptionSection>
      <StoryOptionSection title={text('Captions', 'Subtitrări')}>
        <StorySegmentedControl
          label={text('Captions', 'Subtitrări')}
          value={storyCaptionMode(options)}
          options={[
            { value: 'all', label: text('All dialogue', 'Tot dialogul') },
            { value: 'selective', label: text('Only hard-to-hear speech', 'Doar unde e greu') },
            { value: 'off', label: text('No captions', 'Fără') }
          ]}
          onChange={(mode) => onChange({ ...options, caption_mode: mode, captions: mode !== 'off' })}
        />
      </StoryOptionSection>
      <StoryOptionSection title={text('Brand kit', 'Kit de brand')}>
        <StoryBrandKitField
          enabled={Boolean(options.use_brand_kit)}
          onChange={(enabled) =>
            onChange({
              ...options,
              use_brand_kit: enabled,
              caption_style: enabled ? undefined : options.caption_style
            })
          }
        />
      </StoryOptionSection>
      <StoryOptionSection title={text('Format', 'Format')}>
        <StoryFormat
          value={options.aspect_ratio}
          onChange={(aspect_ratio) => onChange({ ...options, aspect_ratio })}
        />
      </StoryOptionSection>
      <StoryOptionSection title={text('Number of clips', 'Număr de clipuri')}>
        <StoryClipCount
          value={options.clip_count ?? 0}
          onChange={(clip_count) => onChange({ ...options, clip_count })}
        />
      </StoryOptionSection>
      <StoryOptionSection title={text('Length', 'Durată')}>
        {narrated ? (
          <p className={styles.note}>
            {text('Matches your full narration.', 'Urmează narațiunea completă.')}
          </p>
        ) : (
          <StorySegmentedControl
            label={text('Length', 'Durată')}
            value={options.target_seconds}
            options={LENGTHS.map((seconds) => ({ value: seconds, label: `${seconds} s` }))}
            onChange={(target_seconds) => onChange({ ...options, target_seconds })}
          />
        )}
      </StoryOptionSection>
      <StoryMoreOptions options={options} appearance={appearance} onChange={onChange} />
    </div>
  )
}
