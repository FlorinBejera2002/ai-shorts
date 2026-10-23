'use client'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Download, Files } from 'lucide-react'
import type { ClipVariant } from '@/types'
import { availableClipDownloads, clipDownloadName } from './clip-download-utils'

export function ClipDownloadMenu({
  title,
  variants,
  fallbackUrl,
  compact = false,
  label = 'Download',
  formatsLabel = 'Available formats'
}: {
  title: string
  variants?: ClipVariant[]
  fallbackUrl?: string | null
  compact?: boolean
  label?: string
  formatsLabel?: string
}) {
  const downloads = availableClipDownloads(variants, fallbackUrl)

  if (downloads.length === 0) {
    return (
      <Button
        type="button"
        variant="outline"
        disabled={true}
        size={compact ? 'sm' : 'default'}
      >
        <Download className="size-4" />
        {label}
      </Button>
    )
  }

  if (downloads.length === 1) {
    const download = downloads[0]
    return (
      <Button
        asChild={true}
        variant="outline"
        size={compact ? 'sm' : 'default'}
      >
        <a
          href={download.url}
          download={clipDownloadName(title, download.name)}
        >
          <Download className="size-4" />
          {label}
        </a>
      </Button>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild={true}>
        <Button
          type="button"
          variant="outline"
          size={compact ? 'sm' : 'default'}
        >
          <Download className="size-4" />
          {label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>{formatsLabel}</DropdownMenuLabel>
        {downloads.map((variant) => (
          <DropdownMenuItem key={variant.id} asChild={true}>
            <a
              href={variant.url}
              download={clipDownloadName(title, variant.name)}
            >
              <Files className="size-4" />
              <span className="min-w-0">
                <span className="block font-medium">{variant.name}</span>
                <span className="block truncate text-[10px] text-muted-foreground">
                  {[variant.resolution, variant.platforms?.join(', ')]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </span>
            </a>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
