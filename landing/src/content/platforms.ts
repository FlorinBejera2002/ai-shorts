import type { PlatformId } from './copy/types'

/** Platforms are always listed in this order: Instagram, Facebook, TikTok, YouTube. */
export const PLATFORM_ORDER: PlatformId[] = ['instagram', 'facebook', 'tiktok', 'youtube']

export const PLATFORM_LABELS: Record<PlatformId, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  tiktok: 'TikTok',
  youtube: 'YouTube'
}
