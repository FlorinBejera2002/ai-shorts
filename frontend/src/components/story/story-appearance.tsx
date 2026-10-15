import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { BrandKitSelector } from '@/components/create/brand-kit-selector'
import { CaptionPreview } from '@/components/dashboard/brand/caption-preview'
import { CaptionStyleEditor } from '@/components/dashboard/brand/caption-style-editor'
import {
  DEFAULT_CAPTION_STYLE,
  legacyCaptionStyle
} from '@/components/dashboard/brand/caption-style'
import type { BrandKit } from '@/components/dashboard/brand/types'
import { authClient } from '@/lib/auth'
import { storyRequest } from './api'
import { storyCaptionMode, type StoryOptions } from './types'
import { useStoryLanguage } from './use-story-language'

export function StoryAppearance({
  options,
  disabled,
  onChange
}: {
  options: StoryOptions
  disabled: boolean
  onChange: (options: StoryOptions) => void
}) {
  const text = useStoryLanguage()
  const [open, setOpen] = useState(false)
  const userID = authClient.getSnapshot().user?.id
  const kit = useQuery({
    queryKey: ['story-brand-preview', userID],
    queryFn: () => storyRequest<{ brandKit: BrandKit }>('/api/user/brand'),
    enabled: Boolean(options.use_brand_kit && open),
    staleTime: 30000
  })
  const style =
    options.use_brand_kit && kit.data?.brandKit
      ? legacyCaptionStyle(kit.data.brandKit)
      : (options.caption_style ?? DEFAULT_CAPTION_STYLE)
  const ratio =
    options.aspect_ratio === '1:1' || options.aspect_ratio === '16:9'
      ? options.aspect_ratio
      : '9:16'
  return (
    <fieldset disabled={disabled} className="min-w-0 space-y-4">
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
        <details onToggle={(event) => setOpen(event.currentTarget.open)}>
          <summary className="cursor-pointer text-sm font-medium">
            {text('Caption appearance', 'Aspectul subtitrărilor')}
          </summary>
          {open && (
            <div className="mt-4 grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(12rem,20rem)]">
              {options.use_brand_kit ? (
                <p className="text-sm text-muted-foreground">
                  {text(
                    'Using the saved captions and watermark from your Brand Kit. Select No Brand Kit to customize this video.',
                    'Folosim subtitrările și sigla salvate în Brand Kit. Alege Fără Brand Kit pentru a personaliza acest video.'
                  )}
                </p>
              ) : (
                <CaptionStyleEditor
                  value={style}
                  onChange={(caption_style) =>
                    onChange({ ...options, caption_style })
                  }
                />
              )}
              <div className="min-w-0">
                {options.use_brand_kit && kit.isPending ? (
                  <p role="status" className="text-sm">
                    {text('Loading Brand Kit…', 'Se încarcă Brand Kit…')}
                  </p>
                ) : options.use_brand_kit &&
                  (kit.isError || !kit.data?.brandKit) ? (
                  <div className="space-y-2">
                    <p role="alert">
                      {text(
                        'Brand Kit preview unavailable. Retry loading it before generating.',
                        'Previzualizarea Brand Kit nu este disponibilă. Reîncearcă încărcarea înainte de generare.'
                      )}
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void kit.refetch()}
                    >
                      {text('Retry', 'Reîncearcă')}
                    </Button>
                  </div>
                ) : (
                  <CaptionPreview
                    style={style}
                    ratio={ratio}
                    onPositionChange={
                      options.use_brand_kit
                        ? undefined
                        : (position) =>
                            onChange({
                              ...options,
                              caption_style: { ...style, position }
                            })
                    }
                  />
                )}
              </div>
            </div>
          )}
        </details>
      )}
    </fieldset>
  )
}
