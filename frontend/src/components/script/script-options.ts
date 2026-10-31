import type { PublishingProvider } from '@/lib/publishing'

/** Statuses a person can choose; `archived` is only reachable through Archive. */
export const SCRIPT_STATUSES = [
  'idea',
  'draft',
  'review',
  'ready',
  'in_production',
  'published'
] as const

export const SCRIPT_DURATIONS = [15, 30, 45, 60, 90, 120, 180]
export const SCRIPT_LANGUAGES = ['en', 'ro', 'es', 'fr', 'de', 'it', 'pt']

/** Stored value and its `scriptGenerator` message key. */
export const SCRIPT_TONES = [
  ['entertaining', 'toneEntertaining'],
  ['educational', 'toneEducational'],
  ['inspirational', 'toneInspirational'],
  ['sales', 'toneSales'],
  ['storytelling', 'toneStorytelling'],
  ['humorous', 'toneHumorous']
] as const

export const SCRIPT_STYLES = [
  ['talking_head', 'styleTalkingHead'],
  ['b_roll', 'styleBRoll'],
  ['tutorial', 'styleTutorial'],
  ['storytelling', 'styleStorytelling'],
  ['vlog', 'styleVlog'],
  ['product_demo', 'styleProductDemo']
] as const

export const SCRIPT_PLATFORMS: {
  value: PublishingProvider
  label: string
  short: string
}[] = [
  { value: 'tiktok', label: 'TikTok', short: 'TT' },
  { value: 'youtube', label: 'YouTube Shorts', short: 'YT' },
  { value: 'instagram', label: 'Instagram Reels', short: 'IG' },
  { value: 'facebook', label: 'Facebook', short: 'FB' }
]

/** Older briefs stored display text such as "Talking head" for a preset. */
export function matchChoice<T extends { value: string }>(options: T[], value: string) {
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, '_')
  return options.find((option) => option.value === normalized)
}

export function scriptPlatform(value: string) {
  return SCRIPT_PLATFORMS.find((platform) => platform.value === value)
}

export function totalSceneSeconds(scenes: { duration_seconds: number }[]) {
  return scenes.reduce(
    (total, scene) =>
      total + (Number.isFinite(scene.duration_seconds) ? scene.duration_seconds : 0),
    0
  )
}
