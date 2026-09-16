'use client'

import { Button } from '@/components/ui/button'
import { LoadingIndicator } from '@/components/ui/loading-indicator'
import { PageHeader } from '@/components/ui/page-header'
import { AlertCircle } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { CaptionsSection } from './captions-section'
import { ColorsSection } from './colors-section'
import { LogoSection } from './logo-section'
import { PreviewPanel } from './preview-panel'
import { SaveBar } from './save-bar'
import { useBrandKit } from './use-brand-kit'
import { WatermarkSection } from './watermark-section'

export default function BrandPage() {
  const t = useTranslations('brand')
  const brand = useBrandKit((key) => t(key as Parameters<typeof t>[0]))

  if (brand.loading) {
    return (
      <div
        className="animate-fade-in flex min-h-80 items-center justify-center"
        aria-label={t('loading')}
      >
        <LoadingIndicator className="size-5 text-muted-foreground" />
      </div>
    )
  }

  if (brand.loadError) {
    return (
      <div className="animate-fade-in py-16">
        <div className="mx-auto max-w-md rounded-md border bg-card p-8 text-center shadow-sm">
          <span className="mx-auto flex size-11 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <AlertCircle className="size-5" />
          </span>
          <h1 className="mt-4 text-lg font-semibold">{t('loadErrorTitle')}</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {t('loadErrorDesc')}
          </p>
          <Button
            type="button"
            onClick={() => void brand.retry()}
            className="mt-5 rounded-md"
          >
            {t('retry')}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="brand-workspace dashboard-workspace animate-fade-in">
      <PageHeader title={t('title')} description={t('desc')} />

      <SaveBar
        dirty={brand.dirty}
        saving={brand.saving}
        saved={brand.saved}
        logoBusy={brand.logoBusy}
        hasInvalidColor={brand.hasInvalidColor}
        onDiscard={brand.discard}
        onReset={brand.reset}
        onSave={brand.save}
      />

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_272px]">
        <main className="@container grid min-w-0 gap-4">
          <div className="grid gap-4 @min-[800px]:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <LogoSection
              logoUrl={brand.logoPreviewUrl}
              fontFamily={brand.kit.fontFamily}
              fontEnabled={brand.kit.applyBrandFont}
              busy={brand.logoBusy || brand.saving}
              onFontChange={(font) => brand.update('fontFamily', font)}
              onFontEnabledChange={(enabled) =>
                brand.update('applyBrandFont', enabled)
              }
              onUpload={brand.uploadLogo}
              onRemove={brand.removeLogo}
            />
            <ColorsSection kit={brand.kit} update={brand.update} />
          </div>
          <div className="grid gap-4 @min-[800px]:grid-cols-2">
            <CaptionsSection kit={brand.kit} update={brand.update} />
            <WatermarkSection
              kit={brand.kit}
              canWhiteLabel={brand.canWhiteLabel}
              update={brand.update}
            />
          </div>
        </main>
        <PreviewPanel
          kit={brand.kit}
          logoUrl={brand.logoPreviewUrl}
          canWhiteLabel={brand.canWhiteLabel}
        />
      </div>
    </div>
  )
}
