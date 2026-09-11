'use client'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ImagePlus, Loader2, Trash2, Upload } from 'lucide-react'
import { useTranslations } from 'next-intl'
import Image from 'next/image'
import { useRef, useState } from 'react'

import { LOGO_ACCEPT } from './constants'
import { SectionHeading } from './section-heading'

export function LogoSection({
  logoUrl,
  busy,
  onUpload,
  onRemove
}: {
  logoUrl: string | null
  busy: boolean
  onUpload: (file: File) => Promise<void>
  onRemove: () => Promise<void>
}) {
  const t = useTranslations('brand')
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragActive, setDragActive] = useState(false)

  function uploadFirstFile(files: FileList | null) {
    const file = files?.[0]
    if (file) void onUpload(file)
  }

  return (
    <Card id="brand-logo" as="section" className="brand-section p-5 sm:p-6">
      <SectionHeading
        icon={ImagePlus}
        eyebrow={t('identityEyebrow')}
        title={t('logo')}
        description={t('logoDesc')}
      />

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
        <div className="brand-asset-row grid gap-4 rounded-xl border border-border/80 bg-muted/25 p-4 sm:grid-cols-[116px_1fr_auto] sm:items-center">
          <div className="brand-transparency-grid flex h-20 w-28 items-center justify-center rounded-lg border border-border p-3">
            <Image
              src={logoUrl}
              alt={t('yourLogo')}
              width={112}
              height={80}
              unoptimized={true}
              className="max-h-full max-w-full object-contain"
            />
          </div>
          <div>
            <p className="text-sm font-semibold">{t('primaryLogo')}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {t('logoReady')}
            </p>
          </div>
          <div className="flex gap-2 sm:flex-col">
            <Button
              type="button"
              size="sm"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
              variant="outline"
              className="rounded-lg"
            >
              {busy ? <Loader2 className="animate-spin" /> : <Upload />}
              {t('replace')}
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={busy}
              onClick={() => void onRemove()}
              variant="ghost"
              className="rounded-lg text-destructive hover:bg-destructive/10 hover:text-destructive"
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
          className={`brand-upload-zone flex min-h-44 w-full flex-col items-center justify-center rounded-xl border border-dashed px-6 py-8 text-center transition-colors disabled:cursor-wait ${
            dragActive ? 'is-dragging' : ''
          }`}
        >
          <span className="flex size-11 items-center justify-center rounded-full border bg-background shadow-sm">
            {busy ? (
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            ) : (
              <Upload className="size-5 text-foreground" />
            )}
          </span>
          <span className="mt-3 text-sm font-semibold">{t('clickOrDrag')}</span>
          <span className="mt-1 text-xs text-muted-foreground">
            {t('logoFormats')}
          </span>
          <span className="mt-3 rounded-full bg-muted px-2.5 py-1 text-[10px] font-medium text-muted-foreground">
            {t('transparentRecommended')}
          </span>
        </button>
      )}
    </Card>
  )
}
