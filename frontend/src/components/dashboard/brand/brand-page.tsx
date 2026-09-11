'use client'

import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import {
  AlertCircle,
  Captions,
  Check,
  ImagePlus,
  Loader2,
  Palette,
  RotateCcw,
  Save,
  Stamp,
  Undo2
} from 'lucide-react'
import { useTranslations } from 'next-intl'

import { CaptionsSection } from './captions-section'
import { IdentitySection } from './identity-section'
import { LogoSection } from './logo-section'
import { PreviewPanel } from './preview-panel'
import { useBrandKit } from './use-brand-kit'
import { WatermarkSection } from './watermark-section'

const SECTION_LINKS = [
  { href: '#brand-logo', label: 'logo', icon: ImagePlus },
  { href: '#brand-identity', label: 'visualSystem', icon: Palette },
  { href: '#brand-captions', label: 'subtitleStyle', icon: Captions },
  { href: '#brand-watermark', label: 'watermark', icon: Stamp }
] as const

export default function BrandPage() {
  const t = useTranslations('brand')
  const common = useTranslations('common')
  const brand = useBrandKit((key) => t(key as Parameters<typeof t>[0]))

  if (brand.loading) {
    return (
      <div
        className="animate-fade-in flex min-h-80 items-center justify-center"
        aria-label={t('loading')}
      >
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (brand.loadError) {
    return (
      <div className="animate-fade-in py-16">
        <div className="mx-auto max-w-md rounded-xl border bg-card p-8 text-center shadow-sm">
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
            className="mt-5 rounded-lg"
          >
            {t('retry')}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="brand-workspace dashboard-workspace animate-fade-in">
      <PageHeader
        title={t('title')}
        description={t('desc')}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {brand.dirty && (
              <span className="hidden items-center gap-1.5 pr-1 text-[11px] font-medium text-muted-foreground sm:flex">
                <span className="size-1.5 rounded-full bg-warning" />
                {t('unsaved')}
              </span>
            )}
            {brand.dirty && (
              <Button
                type="button"
                onClick={brand.discard}
                variant="ghost"
                className="rounded-lg"
              >
                <Undo2 />
                {t('discard')}
              </Button>
            )}
            <Button
              type="button"
              onClick={brand.reset}
              variant="outline"
              className="rounded-lg"
            >
              <RotateCcw />
              {common('reset')}
            </Button>
            <Button
              type="button"
              onClick={() => void brand.save()}
              disabled={brand.saving || brand.hasInvalidColor}
              title={brand.hasInvalidColor ? t('fixColors') : undefined}
              className="min-w-24 rounded-lg"
            >
              {brand.saving ? (
                <Loader2 className="animate-spin" />
              ) : brand.saved ? (
                <Check />
              ) : (
                <Save />
              )}
              {brand.saved ? common('saved') : common('save')}
            </Button>
          </div>
        }
      />

      <nav
        aria-label={t('sectionNav')}
        className="brand-section-nav mt-5 flex gap-1 overflow-x-auto rounded-xl border bg-card p-1.5"
      >
        {SECTION_LINKS.map(({ href, label, icon: Icon }) => (
          <a
            key={href}
            href={href}
            className="flex min-w-max flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Icon className="size-3.5" />
            {t(label)}
          </a>
        ))}
      </nav>

      <div className="mt-5 grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <main className="grid min-w-0 gap-5">
          <LogoSection
            logoUrl={brand.kit.logoUrl}
            busy={brand.logoBusy}
            onUpload={brand.uploadLogo}
            onRemove={brand.removeLogo}
          />
          <IdentitySection kit={brand.kit} update={brand.update} />
          <CaptionsSection kit={brand.kit} update={brand.update} />
          <WatermarkSection
            kit={brand.kit}
            canWhiteLabel={brand.canWhiteLabel}
            update={brand.update}
          />
        </main>
        <PreviewPanel kit={brand.kit} canWhiteLabel={brand.canWhiteLabel} />
      </div>

      {brand.dirty && (
        <div className="brand-mobile-save fixed inset-x-3 bottom-3 z-40 flex items-center justify-between gap-3 rounded-xl border bg-background/95 p-3 shadow-2xl backdrop-blur md:hidden">
          <p className="text-xs font-medium">{t('unsaved')}</p>
          <Button
            type="button"
            size="sm"
            onClick={() => void brand.save()}
            disabled={brand.saving || brand.hasInvalidColor}
            className="rounded-lg"
          >
            {brand.saving ? <Loader2 className="animate-spin" /> : <Save />}
            {common('save')}
          </Button>
        </div>
      )}
    </div>
  )
}
