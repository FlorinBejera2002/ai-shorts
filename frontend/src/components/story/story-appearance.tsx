import { Button } from '@/components/ui/button'
import { BrandKitSelector } from '@/components/create/brand-kit-selector'
import { CaptionPreview } from '@/components/dashboard/brand/caption-preview'
import { CaptionStyleEditor } from '@/components/dashboard/brand/caption-style-editor'
import { storyCaptionMode, type StoryOptions } from './types'
import { useStoryLanguage } from './use-story-language'
import type { StoryAppearanceState } from './use-story-appearance'

interface Props {
  options: StoryOptions
  disabled: boolean
  appearance: StoryAppearanceState
  onChange: (options: StoryOptions) => void
}

export function StoryAppearance({
  options,
  disabled,
  appearance,
  onChange
}: Props) {
  const text = useStoryLanguage()
  return (
    <fieldset
      disabled={disabled}
      className="story-appearance-controls min-w-0 space-y-4"
    >
      <BrandKitSelector
        enabled={Boolean(options.use_brand_kit)}
        onChange={(enabled) =>
          onChange({
            ...options,
            use_brand_kit: enabled,
            caption_style: enabled ? undefined : options.caption_style
          })
        }
      />
      {storyCaptionMode(options) !== 'off' && (
        <details
          className="story-disclosure"
          open={appearance.open}
          onToggle={(event) => appearance.setOpen(event.currentTarget.open)}
        >
          <summary className="cursor-pointer text-sm font-medium">
            {text('Caption appearance', 'Aspectul subtitrărilor')}
          </summary>
          {appearance.open && (
            <div className="mt-4 min-w-0">
              {options.use_brand_kit ? (
                <p className="text-xs text-muted-foreground">
                  {text('Using your Brand Kit.', 'Folosim Brand Kit-ul tău.')}
                </p>
              ) : (
                <CaptionStyleEditor
                  value={appearance.style}
                  onChange={(caption_style) =>
                    onChange({ ...options, caption_style })
                  }
                />
              )}
            </div>
          )}
        </details>
      )}
    </fieldset>
  )
}

export function StoryAppearancePreview({
  options,
  disabled,
  appearance,
  onChange
}: Props) {
  const text = useStoryLanguage()
  if (!appearance.visible) return null
  return (
    <div className="story-appearance-preview min-w-0">
      {options.use_brand_kit && appearance.kit.isPending ? (
        <p role="status" className="text-sm">
          {text('Loading Brand Kit…', 'Se încarcă Brand Kit…')}
        </p>
      ) : options.use_brand_kit &&
        (appearance.kit.isError || !appearance.kit.data?.brandKit) ? (
        <div className="space-y-3 py-6 text-sm">
          <p role="alert">
            {text(
              'Brand Kit preview unavailable. Retry loading it before generating.',
              'Previzualizarea Brand Kit nu este disponibilă. Reîncearcă încărcarea înainte de generare.'
            )}
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void appearance.kit.refetch()}
          >
            {text('Retry', 'Reîncearcă')}
          </Button>
        </div>
      ) : (
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
      )}
    </div>
  )
}
