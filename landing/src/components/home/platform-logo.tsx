import type { PlatformId } from '@/content/copy/types'

const platformLabels: Record<PlatformId, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  tiktok: 'TikTok',
  youtube: 'YouTube'
}

/** Always rendered in the order Instagram, Facebook, TikTok, YouTube. */
export const PLATFORM_ORDER: PlatformId[] = ['instagram', 'facebook', 'tiktok', 'youtube']

type PlatformLogoProps = { platform: PlatformId; size: number; radius: number; decorative?: boolean }

export function PlatformLogo({ platform, size, radius, decorative = false }: PlatformLogoProps) {
  return (
    <img
      src={`/landing/platforms/${platform}.svg`}
      alt={decorative ? '' : platformLabels[platform]}
      width={size}
      height={size}
      loading="lazy"
      style={{ width: size, height: size, flex: 'none', borderRadius: radius }}
    />
  )
}
