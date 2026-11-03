import type { PublishingProvider } from '@/lib/publishing'
import { cn } from '@/lib/utils'

/** A single-color platform glyph for the reference's circular controls. */
export function PublishingPlatformIcon({ platform, className }: {
  platform: PublishingProvider
  className?: string
}) {
  return (
    <svg viewBox="0 0 48 48" className={cn('size-7 shrink-0', className)} fill="currentColor" aria-hidden="true">
      {platform === 'tiktok' && <path d="M27.8 9h4.5c.4 3 2.2 5.2 5.2 6.2v4.6a13.7 13.7 0 0 1-5.3-1.5v11.2a10.1 10.1 0 1 1-10.1-10.1c.6 0 1.2.1 1.8.2v4.7a5.4 5.4 0 1 0 3.9 5.2V9Z" />}
      {platform === 'youtube' && <path d="m19.2 16.4 15 7.6-15 7.6V16.4Z" />}
      {platform === 'facebook' && <path d="M27.1 40V25.8h4.8l.7-5.5h-5.5v-3.5c0-1.6.4-2.7 2.8-2.7h3V9.2a40 40 0 0 0-4.3-.2c-4.3 0-7.2 2.6-7.2 7.4v3.9h-4.8v5.5h4.8V40h5.7Z" />}
      {platform === 'instagram' && <>
        <rect x="10.5" y="10.5" width="27" height="27" rx="8" fill="none" stroke="currentColor" strokeWidth="3" />
        <circle cx="24" cy="24" r="6.5" fill="none" stroke="currentColor" strokeWidth="3" />
        <circle cx="33.2" cy="14.9" r="2.1" />
      </>}
    </svg>
  )
}
