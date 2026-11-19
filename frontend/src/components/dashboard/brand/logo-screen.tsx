'use client'

import { Link } from '@/i18n/navigation'
import { LoadingIndicator } from '@/components/ui/loading-indicator'
import { ChevronLeft, Lock, Move } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import type { BrandKitController } from './brand-workspace-types'
import { RangeField, ToggleSwitch } from './editor-controls'
import { LogoFileInput, LogoThumb, LogoUploadCard } from './logo-card'
import { OutroThumb } from './outro-thumb'
import styles from './brand-editor.module.css'

const percent = (value: number) => `${Math.round(value)}%`

function logoFormat(type: string | undefined, url: string) {
  const fromType = type?.split('/')[1]
  const fromUrl = new URL(url, 'https://sneepcut.invalid').pathname.split('.').pop()
  return (fromType || fromUrl || '').replace('jpeg', 'jpg').toUpperCase()
}

function logoFileName(name: string | undefined, url: string, fallback: string) {
  if (name) return name
  const last = new URL(url, 'https://sneepcut.invalid').pathname.split('/').pop()
  return last && /\.\w+$/.test(last) ? decodeURIComponent(last) : fallback
}

/** "Logo": the uploaded file with format and size, Înlocuiește and Elimină. */
function LogoAssetCard({ brand, busy }: { brand: BrandKitController; busy: boolean }) {
  const t = useTranslations('brand')
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null)
  const url = brand.logoPreviewUrl
  if (!url) return <LogoUploadCard busy={busy} onUpload={brand.uploadLogo} />
  return (
    <section className={`${styles.card} ${styles.panel}`} aria-labelledby="brand-logo-title" data-brand-logo="">
      <h2 id="brand-logo-title" className={`${styles.heading} ${styles.panelTitle}`}>
        {t('logo')}
      </h2>
      <div className={styles.assetRow}>
        <LogoThumb
          src={url}
          size={72}
          onLoad={(event) => setDimensions({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
        />
        <span className={styles.logoCopy}>
          <b>{logoFileName(brand.logoName, url, t('workspaceDesign.logoFile'))}</b>
          {dimensions !== null && (
            <span className={styles.muted}>
              {t('editor.logoMeta', { format: logoFormat(brand.logoType, url), width: dimensions.width, height: dimensions.height })}
            </span>
          )}
        </span>
        <span className={styles.assetActions}>
          <label className={`${styles.button} ${styles.secondary} ${styles.smallButton} ${styles.fileButton}`} data-busy={busy ? '' : undefined}>
            {brand.logoBusy && <LoadingIndicator />}
            {t('replace')}
            <LogoFileInput busy={busy} onUpload={brand.uploadLogo} />
          </label>
          <button
            type="button"
            className={`${styles.button} ${styles.ghost} ${styles.smallButton} ${styles.dangerText} ${styles.focus}`}
            disabled={busy}
            onClick={() => void brand.removeLogo()}
          >
            {t('remove')}
          </button>
        </span>
      </div>
    </section>
  )
}

/** Watermark switch, size and opacity, and the Sneep Cut ending (white-label on Agency). */
function LogoSettingsCard({ brand, poster }: { brand: BrandKitController; poster?: string }) {
  const t = useTranslations('brand')
  const { kit, update, canWhiteLabel } = brand
  return (
    <section className={`${styles.card} ${styles.panel}`} aria-label={t('watermark')} data-brand-watermark="">
      <label className={styles.switchRow}>
        <span>{t('watermarkEnabled')}</span>
        <ToggleSwitch label={t('watermarkEnabled')} checked={kit.watermarkEnabled} onChange={(on) => update('watermarkEnabled', on)} />
      </label>
      <RangeField
        label={t('editor.size')}
        value={kit.watermarkSize * 100}
        min={1}
        max={50}
        step={1}
        format={percent}
        onChange={(size) => update('watermarkSize', size / 100)}
      />
      <RangeField
        label={t('opacity')}
        value={kit.watermarkOpacity * 100}
        min={10}
        max={100}
        step={1}
        format={percent}
        onChange={(opacity) => update('watermarkOpacity', opacity / 100)}
      />
      <span className={`${styles.hint} ${styles.muted}`}>
        <Move aria-hidden="true" />
        {t('editor.dragLogo')}
      </span>
      <div className={styles.outroRow}>
        <OutroThumb poster={poster} />
        <span className={styles.outroCopy}>
          <b>{t('editor.outro')}</b>
          <span className={styles.muted}>{t('editor.outroDesc')}</span>
          {!canWhiteLabel && (
            <Link href="/dashboard/billing" className={`${styles.upgrade} ${styles.focus}`}>
              <Lock aria-hidden="true" />
              {t('editor.outroUpgrade')}
            </Link>
          )}
        </span>
        <ToggleSwitch
          label={t('editor.outro')}
          checked={!canWhiteLabel || !kit.hidePlatformBadge}
          disabled={!canWhiteLabel}
          onChange={(visible) => update('hidePlatformBadge', !visible)}
        />
      </div>
    </section>
  )
}

/** Canvas Br-Logo: back to the editor, the logo file and its watermark settings. */
export function LogoScreen({
  brand,
  busy,
  poster,
  onBack
}: {
  brand: BrandKitController
  busy: boolean
  poster?: string
  onBack: () => void
}) {
  const t = useTranslations('brand')
  const common = useTranslations('common')
  return (
    <>
      <div className={styles.screenHead} data-order="first">
        <button type="button" className={`${styles.button} ${styles.secondary} ${styles.backButton} ${styles.focus}`} onClick={onBack} data-brand-back="">
          <ChevronLeft aria-hidden="true" />
          {common('back')}
        </button>
        <h2 className={styles.heading}>{t('logoWatermark')}</h2>
      </div>
      <LogoAssetCard brand={brand} busy={busy} />
      <LogoSettingsCard brand={brand} poster={poster} />
    </>
  )
}
