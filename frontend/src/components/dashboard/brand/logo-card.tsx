'use client'

import { LoadingIndicator } from '@/components/ui/loading-indicator'
import { ChevronRight, Upload } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState, type SyntheticEvent } from 'react'
import { LOGO_ACCEPT } from './constants'
import type { BrandKit } from './types'
import styles from './brand-editor.module.css'

export function LogoThumb({ src, size, onLoad }: { src: string; size: number; onLoad?: (event: SyntheticEvent<HTMLImageElement>) => void }) {
  const t = useTranslations('brand')
  return (
    <span className={styles.checker} style={{ width: size, height: size, borderRadius: size > 60 ? 14 : 12 }}>
      <img src={src} alt={t('yourLogo')} onLoad={onLoad} />
    </span>
  )
}

/** Hidden logo file input; the visible control is the label that wraps it. */
export function LogoFileInput({ busy, onUpload }: { busy: boolean; onUpload: (file: File) => Promise<void> }) {
  const t = useTranslations('brand')
  return (
    <input
      type="file"
      accept={LOGO_ACCEPT}
      aria-label={t('uploadLogo')}
      className={styles.fileInput}
      disabled={busy}
      data-brand-logo-file=""
      onChange={(event) => {
        const file = event.target.files?.[0]
        event.target.value = ''
        if (file) void onUpload(file)
      }}
    />
  )
}

/** Canvas Br-Empty: no logo yet — illustration, formats and "Încarcă logo" (click or drop). */
export function LogoUploadCard({ busy, onUpload }: { busy: boolean; onUpload: (file: File) => Promise<void> }) {
  const t = useTranslations('brand')
  const [dragActive, setDragActive] = useState(false)
  return (
    <label
      className={`${styles.card} ${styles.logoEmpty}`}
      data-drag-active={dragActive ? '' : undefined}
      data-brand-logo-empty=""
      onDragOver={(event) => {
        event.preventDefault()
        if (!busy) setDragActive(true)
      }}
      onDragLeave={() => setDragActive(false)}
      onDrop={(event) => {
        event.preventDefault()
        setDragActive(false)
        const file = event.dataTransfer.files[0]
        if (file && !busy) void onUpload(file)
      }}
    >
      <img src="/illustrations/brand-nologo.webp" alt={t('editor.logoEmptyIllustration')} width={64} height={64} />
      <span className={styles.logoCopy}>
        <b>{t('logoWatermark')}</b>
        <span className={styles.muted}>{t('logoFormats')}</span>
      </span>
      <span className={`${styles.button} ${styles.secondary} ${styles.smallButton}`} aria-hidden="true">
        {busy ? <LoadingIndicator /> : <Upload />}
        {t('uploadLogo')}
      </span>
      <LogoFileInput busy={busy} onUpload={onUpload} />
    </label>
  )
}

/** Collapsed "Logo și filigran" row that opens the logo screen. */
export function LogoSummaryCard({ kit, logoUrl, onOpen }: { kit: BrandKit; logoUrl: string; onOpen: () => void }) {
  const t = useTranslations('brand')
  return (
    <button type="button" className={`${styles.card} ${styles.logoSummary} ${styles.focus}`} onClick={onOpen} data-brand-logo-summary="">
      <LogoThumb src={logoUrl} size={48} />
      <span className={styles.logoCopy}>
        <b>{t('logoWatermark')}</b>
        <span className={styles.muted}>
          {t('editor.logoSummary', { size: Math.round(kit.watermarkSize * 100), opacity: Math.round(kit.watermarkOpacity * 100) })}
        </span>
      </span>
      <ChevronRight aria-hidden="true" />
    </button>
  )
}
