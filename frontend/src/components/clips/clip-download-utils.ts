import type { ClipVariant } from '@/types'

export function availableClipDownloads(
  variants?: ClipVariant[],
  fallbackUrl?: string | null
): ClipVariant[] {
  const available =
    variants?.filter((variant) => variant.status !== 'failed' && variant.url) ??
    []
  if (available.length) return available
  return fallbackUrl
    ? [{ id: 'primary', name: 'Universal Social', url: fallbackUrl }]
    : []
}

export function clipDownloadName(title: string, variant?: string) {
  const safeTitle =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'clip'
  const safeVariant = (variant ?? 'video')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
  return `${safeTitle}-${safeVariant}.mp4`
}
