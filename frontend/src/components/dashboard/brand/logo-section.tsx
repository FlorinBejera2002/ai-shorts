'use client'

import { Button } from '@/components/ui/button'
import { LoadingIndicator } from '@/components/ui/loading-indicator'
import { ImagePlus, Trash2, Upload } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useRef, useState } from 'react'
import { LOGO_ACCEPT } from './constants'
import styles from './logo-section.module.css'

export function LogoSection({
  logoUrl,
  fileName,
  busy,
  onUpload,
  onRemove
}: {
  logoUrl: string | null
  fileName?: string
  busy: boolean
  onUpload: (file: File) => Promise<void>
  onRemove: () => Promise<void>
}) {
  const t = useTranslations('brand')
  const input = useRef<HTMLInputElement>(null)
  const [dragActive, setDragActive] = useState(false)

  function uploadFirstFile(files: FileList | null) {
    if (!busy && files?.[0]) void onUpload(files[0])
  }

  return (
    <div id="brand-logo" className={styles.logo}>
      <input
        ref={input}
        type="file"
        accept={LOGO_ACCEPT}
        aria-label={t('uploadLogo')}
        className="sr-only"
        data-brand-logo-file=""
        onChange={(event) => {
          uploadFirstFile(event.target.files)
          event.target.value = ''
        }}
      />
      {logoUrl ? (
        <div className={styles.asset}>
          <div className={`${styles.image} brand-transparency-grid`}>
            <img src={logoUrl} alt={t('yourLogo')} />
          </div>
          <div className={styles.description}>
            <p>{fileName || t('workspaceDesign.logoFile')}</p>
            <small>{t('logoFormats')}</small>
          </div>
          <div className={styles.actions}>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => input.current?.click()}
            >
              {busy ? <LoadingIndicator /> : <Upload aria-hidden="true" />}
              {t('replace')}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => void onRemove()}
              className="text-destructive hover:bg-muted hover:text-destructive"
            >
              <Trash2 aria-hidden="true" />
              {t('remove')}
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className={styles.upload}
          disabled={busy}
          data-drag-active={dragActive}
          title={t('clickOrDrag')}
          onClick={() => input.current?.click()}
          onDragOver={(event) => {
            event.preventDefault()
            if (!busy) setDragActive(true)
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={(event) => {
            event.preventDefault()
            setDragActive(false)
            uploadFirstFile(event.dataTransfer.files)
          }}
        >
          {busy ? (
            <LoadingIndicator className="size-6" />
          ) : (
            <ImagePlus className="size-6" aria-hidden="true" />
          )}
          <span>{t('uploadLogo')}</span>
          <small>{t('logoFormats')}</small>
        </button>
      )}
    </div>
  )
}
