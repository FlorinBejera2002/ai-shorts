import type { PublishingProvider } from '@/lib/publishing'
import { cn } from '@/lib/utils'

type PlatformBrandIconProps = {
  className?: string
  provider: PublishingProvider
}

const PLATFORM_LOGOS: Record<PublishingProvider, string> = {
  facebook: '/brand/social/facebook-square.svg',
  instagram: '/brand/social/instagram.svg',
  linkedin: '/brand/social/linkedin.svg',
  tiktok: '/brand/social/tiktok.svg',
  youtube: '/brand/social/youtube.svg'
}

export function PlatformBrandIcon({
  className,
  provider
}: PlatformBrandIconProps) {
  return (
    <img
      alt=""
      aria-hidden="true"
      className={cn('aspect-square rounded-md object-contain', className)}
      data-platform-mark={provider}
      src={PLATFORM_LOGOS[provider]}
    />
  )
}
