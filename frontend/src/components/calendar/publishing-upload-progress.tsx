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
      className="flex w-full min-w-0 flex-col items-center text-center"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <span className="flex size-20 items-center justify-center overflow-hidden">
        <LoadingIndicator className="size-48 max-w-none motion-reduce:hidden" />
        <ImagePlus
          className="hidden size-9 motion-reduce:block"
          aria-hidden="true"
        />
      </span>
      <span className="mt-2 text-sm font-semibold text-foreground">
        {t('mediaProgress', { current, total })}
      </span>
      <span className="mt-1 w-full truncate text-xs text-muted-foreground">
        {filename}
      </span>
      <span className="mt-4 flex w-40 max-w-full gap-1.5" aria-hidden="true">
        {Array.from({ length: total }, (_, index) => (
          <span
            key={`upload-${index}`}
            className={`h-1 flex-1 rounded-full ${index < current - 1 ? 'bg-foreground' : index === current - 1 ? 'animate-pulse bg-foreground/50 motion-reduce:animate-none' : 'bg-border'}`}
          />
        ))}
      </span>
    </span>
  )
}
