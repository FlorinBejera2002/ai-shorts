import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { CaptionPreview } from './caption-preview'
import { legacyCaptionStyle } from './caption-style'
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
  const [rw = 1, rh = 1] = ratio.split(':').map(Number)
  const short = Math.min(rw, rh)
  const position: React.CSSProperties = {
    opacity: kit.watermarkOpacity,
    width: `${kit.watermarkSize * 100}%`,
    height: `${kit.watermarkSize * 100}%`,
    objectPosition: kit.watermarkPosition.replace('-', ' '),
    [kit.watermarkPosition.startsWith('top') ? 'top' : 'bottom']:
      `${((kit.watermarkMargin * short) / rh) * 100}%`,
    [kit.watermarkPosition.endsWith('left') ? 'left' : 'right']:
      `${((kit.watermarkMargin * short) / rw) * 100}%`
  }
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
        >
          {logoUrl && kit.watermarkEnabled && (
            <img
              src={logoUrl}
              alt={t('yourLogo')}
              className="pointer-events-none absolute object-contain"
              style={position}
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
