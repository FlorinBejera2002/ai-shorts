'use client'

import { LoadingIndicator } from '@/components/ui/loading-indicator'
import { ImagePlus } from 'lucide-react'
import { useTranslations } from 'next-intl'

export function PublishingUploadProgress({
  current,
  total,
  filename
}: {
  current: number
  total: number
  filename: string
}) {
  const t = useTranslations('contentCalendar.form')

  return (
    <span
      className="flex w-full min-w-0 items-center gap-3 text-left"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-muted">
        <LoadingIndicator className="size-5 motion-reduce:hidden" />
        <ImagePlus
          className="hidden size-5 motion-reduce:block"
          aria-hidden="true"
        />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium">{filename}</span>
        <span className="mt-1 block text-[11px] text-muted-foreground">{t('mediaProgress', { current, total })}</span>
        <span className="mt-2 flex w-full gap-1" aria-hidden="true">
        {Array.from({ length: total }, (_, index) => (
          <span
            key={`upload-${index}`}
            className={`h-1.5 flex-1 rounded-full ${index < current - 1 ? 'bg-primary' : index === current - 1 ? 'animate-pulse bg-primary/50 motion-reduce:animate-none' : 'bg-border'}`}
          />
        ))}
        </span>
      </span>
    </span>
  )
}
