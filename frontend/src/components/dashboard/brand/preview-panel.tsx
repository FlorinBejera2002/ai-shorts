import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { CaptionPreview } from './caption-preview'
import { legacyCaptionStyle } from './caption-style'
import { LogoPreview } from './logo-preview'
import type { BrandKit, BrandKitUpdate, PreviewRatio } from './types'
export function PreviewPanel({
  kit,
  logoUrl,
  canWhiteLabel,
  update
}: {
  kit: BrandKit
  logoUrl: string | null
  canWhiteLabel: boolean
  update: BrandKitUpdate
}) {
  const t = useTranslations('brand'),
    [ratio, setRatio] = useState<PreviewRatio>('9:16'),
    style = legacyCaptionStyle(kit)
  return (
    <aside className="order-1 w-full xl:order-2 xl:sticky xl:top-20">
      <Card className="gap-3 p-3">
        <h2 className="text-sm font-semibold">{t('preview')}</h2>
        <div className="grid grid-cols-3 gap-1">
          {(['9:16', '1:1', '16:9'] as const).map((r) => (
            <Button
              type="button"
              key={r}
              variant={r === ratio ? 'default' : 'outline'}
              aria-pressed={r === ratio}
              onClick={() => setRatio(r)}
            >
              {r}
            </Button>
          ))}
        </div>
        <CaptionPreview
          style={style}
          ratio={ratio}
          onPositionChange={(position) =>
            update('captionStyle', { ...style, position })
          }
          onTransformChange={(position, size) =>
            update('captionStyle', { ...style, position, size })
          }
        >
          {logoUrl && kit.watermarkEnabled && (
            <LogoPreview
              kit={kit}
              src={logoUrl}
              label={t('yourLogo')}
              ratio={ratio}
              update={update}
            />
          )}
          {(!canWhiteLabel || !kit.hidePlatformBadge) && (
            <span className="absolute left-2 top-2 text-[8px] text-white/80">
              sneepcut
            </span>
          )}
        </CaptionPreview>
        <p className="text-xs text-muted-foreground">{t('dragCaptionHint')}</p>
      </Card>
    </aside>
  )
}
