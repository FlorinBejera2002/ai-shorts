export const PUBLISHING_PROVIDER_CATALOG = [
  { id: 'instagram', name: 'Instagram' },
  { id: 'facebook', name: 'Facebook' },
  { id: 'tiktok', name: 'TikTok' },
  { id: 'youtube', name: 'YouTube' },
  { id: 'linkedin', name: 'LinkedIn' }
] as const

export type PublishingProvider =
  (typeof PUBLISHING_PROVIDER_CATALOG)[number]['id']
export type PublishingAccount = {
  id: string
  provider: PublishingProvider
  name: string
  username?: string
  avatarUrl?: string
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
    youtubeAuditApproved?: boolean
    linkedinOrganizationEnabled?: boolean
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
    captionTiktok?: string
  }[]
  posts: PublishingPost[]
}

export function withAllPublishingProviders(
  providers: PublishingData['providers']
): PublishingData['providers'] {
  const configuredProviders = new Map(
    providers.map((provider) => [provider.id, provider])
  )
  return PUBLISHING_PROVIDER_CATALOG.map(
    (provider) =>
      configuredProviders.get(provider.id) ?? {
        ...provider,
        configured: false,
        supportsPublishing: false,
        reason: 'Integration coming soon'
      }
  )
}
export type CreatorOptions = {
  privacyLevels: string[]
  commentDisabled: boolean
  duetDisabled: boolean
  stitchDisabled: boolean
  maxDuration: number
  nickname: string
}

export function isPublishingAccountUsable(account: PublishingAccount) {
  return (
    account.status === 'connected' &&
    (account.provider !== 'youtube' || account.scopes?.includes('video_publish') === true) &&
    (['tiktok', 'youtube'].includes(account.provider) || account.tokenExpired !== true)
  )
}
