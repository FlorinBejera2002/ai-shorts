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
      done: clip.aspectRatio === '9:16',
    },
    {
      label: 'Short-form length',
      done: clip.duration >= 15 && clip.duration <= 60,
    },
    {
      label: 'Captions included',
      done: clip.hasSubtitles,
    },
    {
      label: 'Hook prepared',
      done: Boolean(clip.hookText?.trim()),
    },
    {
      label: 'Transcript available',
      done: Boolean(clip.transcriptText?.trim()),
    },
    {
      label: 'Playable export',
      done: Boolean(clip.fileUrl),
    },
  ]

  const completed = items.filter((item) => item.done).length
  const baseScore = Math.round((completed / items.length) * 100)
  const scoreBoost = clip.viralScore >= 8 ? 8 : clip.viralScore >= 6 ? 4 : 0
  const score = Math.min(100, baseScore + scoreBoost)

  return {
    score,
    items,
    label: score >= 85 ? 'Ready' : score >= 65 ? 'Needs review' : 'Needs work',
  }
}

export function getPlatformFit(clip: ClipReadinessInput) {
  return [
    {
      name: 'TikTok',
      fit: clip.aspectRatio === '9:16' && clip.duration <= 60,
      note: 'Best with captions, a strong first line and 15-45s pacing.',
    },
    {
      name: 'Reels',
      fit: clip.aspectRatio === '9:16' && clip.duration <= 90,
      note: 'Works well when the hook is clear and visual framing is tight.',
    },
    {
      name: 'Shorts',
      fit: clip.aspectRatio === '9:16' && clip.duration <= 60,
      note: 'Keep title direct and avoid slow intros.',
    },
    {
      name: 'LinkedIn',
      fit: clip.duration <= 120,
      note: 'Use a more explicit title and context-heavy caption.',
    },
  ]
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
    '\n#shorts #reels #contentcreator #videomarketing',
  ].join('')
}
