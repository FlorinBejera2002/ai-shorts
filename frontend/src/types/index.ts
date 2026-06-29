export interface Job {
  id: string
  userId: string
  sourceType: 'upload' | 'youtube' | 'url'
  sourceUrl: string | null
  status:
    | 'pending'
    | 'downloading'
    | 'transcribing'
    | 'analyzing'
    | 'clipping'
    | 'rendering'
    | 'completed'
    | 'failed'
  progress: number
  progressMessage: string | null
  numClipsRequested: number
  aspectRatio: string
  creditsCharged: number
  createdAt: string
  completedAt: string | null
}

export interface Clip {
  id: string
  jobId: string
  title: string
  hookText: string | null
  viralScore: number
  scoreReason: string | null
  startTime: number
  endTime: number
  duration: number
  filePath: string
  fileUrl: string | null
  thumbnailUrl: string | null
  fileSize: number
  resolution: string
  aspectRatio: string
  hasSubtitles: boolean
  transcriptText: string | null
  createdAt: string
}

export type Plan = 'free' | 'creator' | 'pro' | 'agency'
