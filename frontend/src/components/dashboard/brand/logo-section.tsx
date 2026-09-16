'use client'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { LoadingIndicator } from '@/components/ui/loading-indicator'
import { Trash2, Upload } from 'lucide-react'
import { useTranslations } from 'next-intl'
import Image from 'next/image'
import { useRef, useState } from 'react'

import { BrandFontField } from './brand-font-field'
import { LOGO_ACCEPT } from './constants'

export function LogoSection({
  logoUrl,
  fontFamily,
  fontEnabled,
  busy,
  onFontChange,
  onFontEnabledChange,
  onUpload,
  onRemove
}: {
  logoUrl: string | null
  fontFamily: string
  fontEnabled: boolean
  busy: boolean
  onFontChange: (font: string) => void
  onFontEnabledChange: (enabled: boolean) => void
  onUpload: (file: File) => Promise<void>
  onRemove: () => Promise<void>
}) {
  const t = useTranslations('brand')
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragActive, setDragActive] = useState(false)

  function uploadFirstFile(files: FileList | null) {
    if (busy) return
    const file = files?.[0]
    if (file) void onUpload(file)
  }

  return (
    <Card
      as="section"
      id="brand-logo"
      className="brand-section @container/logo min-w-0 gap-3 p-4"
    >
      <h2 className="text-sm font-semibold">{t('logo')}</h2>

      <input
        ref={inputRef}
        type="file"
        accept={LOGO_ACCEPT}
        aria-label={t('uploadLogo')}
        className="sr-only"
        onChange={(event) => {
          uploadFirstFile(event.target.files)
          event.target.value = ''
        }}
      />

      {logoUrl ? (
        <div className="brand-asset-row grid grid-cols-[80px_minmax(0,1fr)] items-center gap-3">
          <div className="brand-transparency-grid flex h-14 w-20 items-center justify-center rounded-md border border-border p-2">
            <Image
              src={logoUrl}
              alt={t('yourLogo')}
              width={112}
              height={80}
              unoptimized={true}
              className="max-h-full max-w-full object-contain"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
              variant="outline"
              className="rounded-md bg-card shadow-none"
            >
              {busy ? <LoadingIndicator /> : <Upload />}
              {t('replace')}
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={busy}
              onClick={() => void onRemove()}
              variant="ghost"
              className="rounded-md text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 />
              {t('remove')}
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={busy}
          title={t('clickOrDrag')}
          onClick={() => inputRef.current?.click()}
          onDragOver={(event) => {
            event.preventDefault()
            setDragActive(true)
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={(event) => {
            event.preventDefault()
            setDragActive(false)
            uploadFirstFile(event.dataTransfer.files)
          }}
          className={`brand-upload-zone flex min-h-16 w-full items-center gap-3 rounded-md border border-dashed px-3 py-3 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-wait ${
            dragActive ? 'is-dragging' : ''
          }`}
        >
          <span className="flex size-8 shrink-0 items-center justify-center text-primary">
            {busy ? (
              <LoadingIndicator className="size-5" />
            ) : (
              <Upload className="size-5" />
            )}
          </span>
          <span className="grid gap-1">
            <span className="text-xs font-semibold">{t('uploadLogo')}</span>
            <span className="text-[11px] text-muted-foreground">
              {t('logoFormats')}
            </span>
          </span>
        </button>
      )}
      <BrandFontField
        value={fontFamily}
        enabled={fontEnabled}
        onChange={onFontChange}
        onEnabledChange={onFontEnabledChange}
      />
    </Card>
  )
}
