import { Button } from '@/components/ui/button'
import { CaptionPreview } from '@/components/dashboard/brand/caption-preview'
import { CaptionStyleEditor } from '@/components/dashboard/brand/caption-style-editor'
import { storyCaptionMode, type StoryOptions } from './types'
import { useStoryLanguage } from './use-story-language'
import type { StoryAppearanceState } from './use-story-appearance'
import styles from './story-options.module.css'

interface Props {
  options: StoryOptions
  disabled: boolean
  appearance: StoryAppearanceState
  onChange: (options: StoryOptions) => void
}

/** Caption style editor, shown under "More options" while captions are on. */
export function StoryAppearance({
  options,
  appearance,
  onChange
}: Omit<Props, 'disabled'>) {
  const text = useStoryLanguage()
  if (storyCaptionMode(options) === 'off') return null
  return (
    <details
      className={styles.moreBody}
      open={appearance.open}
      onToggle={(event) => appearance.setOpen(event.currentTarget.open)}
    >
      <summary className={styles.note}>
        {text('Caption appearance', 'Aspectul subtitrărilor')}
      </summary>
      {appearance.open && (
        <div>
          {options.use_brand_kit ? (
            <p className={styles.note}>
              {text('Using your Brand Kit.', 'Folosim Brand Kit-ul tău.')}
            </p>
          ) : (
            <CaptionStyleEditor
              value={appearance.style}
              onChange={(caption_style) => onChange({ ...options, caption_style })}
            />
          )}
        </div>
      )}
    </details>
  )
}

/** Live caption preview. Shown in the preview frame while the caption style is being edited. */
export function StoryAppearancePreview({ options, disabled, appearance, onChange }: Props) {
  const text = useStoryLanguage()
  if (!appearance.visible) return null
  if (options.use_brand_kit && appearance.kit.isPending) {
    return (
      <p role="status" className={styles.note}>
        {text('Loading Brand Kit…', 'Se încarcă Brand Kit…')}
      </p>
    )
  }
  if (
    options.use_brand_kit &&
    (appearance.kit.isError || !appearance.kit.data?.brandKit)
  ) {
    return (
      <div className={styles.moreBody}>
        <p role="alert" className={styles.note}>
          {text(
            'Brand Kit preview unavailable. Retry loading it before generating.',
            'Previzualizarea Brand Kit nu este disponibilă. Reîncearcă încărcarea înainte de generare.'
          )}
        </p>
        <Button size="sm" variant="outline" onClick={() => void appearance.kit.refetch()}>
          {text('Retry', 'Reîncearcă')}
        </Button>
      </div>
    )
  }
  return (
    <CaptionPreview
      style={appearance.style}
      ratio={appearance.ratio}
      onPositionChange={
        options.use_brand_kit || disabled
          ? undefined
          : (position) =>
              onChange({
                ...options,
                caption_style: { ...appearance.style, position }
              })
      }
    />
  )
}
