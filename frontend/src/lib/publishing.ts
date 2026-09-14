export type PublishingProvider = 'instagram' | 'facebook' | 'tiktok' | 'youtube'
export type PublishingAccount = {
  id: string
  provider: PublishingProvider
  name: string
  username?: string
  status: string
  scopes?: string[]
  tokenExpiresAt?: string
  tokenExpired?: boolean
}
export type PublishingPost = {
  id: string
  clipId: string
  accountId: string
  provider: PublishingProvider
  status:
    | 'queued'
    | 'processing'
    | 'submitting'
    | 'finalizing'
    | 'published'
    | 'failed'
    | 'unknown'
    | 'cancelled'
  error?: string
  createdAt: string
  url?: string
}
export type PublishingData = {
  providers: {
    id: PublishingProvider
    name: string
    configured: boolean
    supportsPublishing: boolean
    reason?: string
  }[]
  accounts: PublishingAccount[]
  clips: {
    id: string
    title: string
    duration: number
    tiktokEligible?: boolean
    thumbnailUrl?: string
    fileUrl?: string
  }[]
  posts: PublishingPost[]
}
export type CreatorOptions = {
  privacyLevels: string[]
  commentDisabled: boolean
  duetDisabled: boolean
  stitchDisabled: boolean
  maxDuration: number
  nickname: string
}
