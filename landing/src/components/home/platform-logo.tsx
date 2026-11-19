import type { PlatformId } from '@/content/copy/types'
import { PLATFORM_LABELS } from '@/content/platforms'

type PlatformLogoProps = { platform: PlatformId; size: number; radius: number; decorative?: boolean }

export function PlatformLogo({ platform, size, radius, decorative = false }: PlatformLogoProps) {
  return (
    <img
      src={`/landing/platforms/${platform}.svg`}
      alt={decorative ? '' : PLATFORM_LABELS[platform]}
      width={size}
      height={size}
      loading="lazy"
      style={{ width: size, height: size, flex: 'none', borderRadius: radius }}
    />
  )
}
