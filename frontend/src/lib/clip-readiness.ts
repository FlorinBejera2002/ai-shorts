import {
  SOCIAL_PLATFORMS,
  platformCompatibility,
  type VideoAspectRatio
} from '@/lib/platform-formats'

type ClipReadinessInput = {
  duration: number
  aspectRatio: string
  hasSubtitles: boolean
  hookText: string | null
  viralScore: number
  transcriptText: string | null
  fileUrl: string | null
}

export type ClipReadinessItem = {
  label: string
  done: boolean
}

export function getClipReadiness(clip: ClipReadinessInput) {
  const items: ClipReadinessItem[] = [
    {
      label: 'Vertical export',
      done: clip.aspectRatio === '9:16'
    },
    {
      label: 'Short-form length',
      done: clip.duration >= 15 && clip.duration <= 60
    },
    {
      label: 'Captions included',
      done: clip.hasSubtitles
    },
    {
      label: 'Hook prepared',
      done: Boolean(clip.hookText?.trim())
    },
    {
      label: 'Transcript available',
      done: Boolean(clip.transcriptText?.trim())
    },
    {
      label: 'Playable export',
      done: Boolean(clip.fileUrl)
    }
  ]

  const completed = items.filter((item) => item.done).length
  const baseScore = Math.round((completed / items.length) * 100)
  const scoreBoost = clip.viralScore >= 8 ? 8 : clip.viralScore >= 6 ? 4 : 0
  const score = Math.min(100, baseScore + scoreBoost)

  return {
    score,
    items,
    label: score >= 85 ? 'Ready' : score >= 65 ? 'Needs review' : 'Needs work'
  }
}

export function getPlatformFit(clip: ClipReadinessInput) {
  const aspectRatio = (['9:16', '1:1', '16:9'].includes(clip.aspectRatio)
    ? clip.aspectRatio
    : '9:16') as VideoAspectRatio
  const names = {
    instagram: 'Instagram',
    facebook: 'Facebook',
    tiktok: 'TikTok',
    youtube: aspectRatio === '16:9' ? 'YouTube' : 'YouTube Shorts',
    linkedin: 'LinkedIn'
  }
  return SOCIAL_PLATFORMS.map((platform) => {
    const status = platformCompatibility(aspectRatio, platform, clip.duration)
    return {
      name: names[platform],
      fit: status !== 'incompatible',
      status,
      note:
        status === 'incompatible'
          ? 'The current duration or format is outside this destination’s publishing profile.'
          : status === 'adaptation'
            ? 'Choose Universal Social to avoid platform cropping or padding.'
            : status === 'recommended'
              ? 'This is a recommended publishing format for the destination.'
              : 'The destination accepts this format.'
    }
  })
}

export function buildSocialCaption(clip: {
  title: string
  hookText: string | null
  scoreReason: string | null
  transcriptText: string | null
}) {
  const hook = clip.hookText?.trim()
  const reason = clip.scoreReason?.trim()
  const transcript = clip.transcriptText?.trim()
  const context = reason || transcript?.slice(0, 180)

  return [
    hook || clip.title,
    context ? `\n${context}` : '',
    '\n#shorts #reels #contentcreator #videomarketing'
  ].join('')
}
