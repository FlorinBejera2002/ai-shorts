import type { ContentPlatform } from '@/lib/content-calendar'

export type VideoAspectRatio = '9:16' | '1:1' | '16:9'
export type PlatformCompatibility = 'recommended' | 'accepted' | 'adaptation'

export const SOCIAL_PLATFORMS: ContentPlatform[] = [
  'instagram',
  'facebook',
  'tiktok',
  'youtube',
  'linkedin',
  'twitter'
]

export const VIDEO_FORMATS: Record<
  VideoAspectRatio,
  {
    name: string
    resolution: string
    compatibility: Record<ContentPlatform, PlatformCompatibility>
  }
> = {
  '9:16': {
    name: 'Universal Social',
    resolution: '1080 × 1920',
    compatibility: {
      instagram: 'recommended',
      facebook: 'recommended',
      tiktok: 'recommended',
      youtube: 'recommended',
      linkedin: 'accepted',
      twitter: 'accepted'
    }
  },
  '1:1': {
    name: 'Square Social',
    resolution: '1080 × 1080',
    compatibility: {
      instagram: 'accepted',
      facebook: 'accepted',
      tiktok: 'accepted',
      youtube: 'recommended',
      linkedin: 'recommended',
      twitter: 'recommended'
    }
  },
  '16:9': {
    name: 'Landscape',
    resolution: '1920 × 1080',
    compatibility: {
      instagram: 'adaptation',
      facebook: 'accepted',
      tiktok: 'adaptation',
      youtube: 'recommended',
      linkedin: 'recommended',
      twitter: 'recommended'
    }
  }
}

export function platformCompatibility(
  aspectRatio: VideoAspectRatio,
  platform: ContentPlatform,
  duration?: number
): PlatformCompatibility | 'incompatible' {
  if (duration !== undefined) {
    if (duration < 3 && platform !== 'twitter') return 'incompatible'
    if (platform === 'facebook' && duration > 90) return 'incompatible'
    if (platform === 'youtube' && duration > 180 && aspectRatio !== '16:9') {
      return 'incompatible'
    }
    if (platform === 'twitter' && duration > 140) return 'incompatible'
    if (platform === 'tiktok' && duration > 600) return 'incompatible'
    if (platform === 'instagram' && duration > 900) return 'incompatible'
    if (platform === 'linkedin' && duration > 1800) return 'incompatible'
  }
  return VIDEO_FORMATS[aspectRatio].compatibility[platform]
}
