import { Card } from '@/components/ui/card'
import { useTranslations } from 'next-intl'
import { CaptionStyleEditor } from './caption-style-editor'
import { legacyCaptionStyle } from './caption-style'
import type { BrandKit, BrandKitUpdate } from './types'
export function CaptionsSection({
  kit,
  update
}: {
  kit: BrandKit
  update: BrandKitUpdate
}) {
  const t = useTranslations('brand')
  return (
    <Card as="section" id="brand-captions" className="gap-4 p-4">
      <h2 className="text-sm font-semibold">{t('subtitleStyle')}</h2>
      <CaptionStyleEditor
        value={legacyCaptionStyle(kit)}
        onChange={(value) => update('captionStyle', value)}
      />
    </Card>
  )
}
