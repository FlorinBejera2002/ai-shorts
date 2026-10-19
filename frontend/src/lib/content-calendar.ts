export const CONTENT_PLATFORMS = [
  'tiktok',
  'instagram',
  'facebook',
  'youtube'
] as const

export const CONTENT_POST_STATUSES = [
  'draft',
  'scheduled',
  'publishing',
  'failed',
  'published'
] as const

export type ContentPlatform = (typeof CONTENT_PLATFORMS)[number]
export type ContentPostStatus = (typeof CONTENT_POST_STATUSES)[number]
export type CalendarMutationStatus = 'draft' | 'scheduled' | 'publish'

export type PublishingDestinationStatus =
  | 'queued'
  | 'submitting'
  | 'processing'
  | 'finalizing'
  | 'published'
  | 'failed'
  | 'unknown'
  | 'cancelled'

export type PublishingDestination = {
  provider: ContentPlatform
  accountName: string
  status: PublishingDestinationStatus
  error?: string
  url?: string
  createdAt: string
  updatedAt: string
}

export type CalendarClipOption = {
  id: string
  title: string
  viralScore: number
  duration: number
  tiktokEligible: boolean
  thumbnailUrl: string | null
  captionTiktok: string | null
  captionInstagram: string | null
  captionYoutube: string | null
}

export type PublishingImageCrop = {
  aspectRatio: '1:1' | '4:5' | '1.91:1'
  x: number
  y: number
  zoom: number
}

export type PublishingImageUserTag = {
  username: string
  x: number
  y: number
}

export type PublishingMedia = {
  type: 'image' | 'video'
  reference: string
  name: string
  altText?: string
  crop?: PublishingImageCrop
  userTags?: PublishingImageUserTag[]
}

export type TikTokPublishingOptions = {
  privacyLevel: string
  disableComment: boolean
  disableDuet: boolean
  disableStitch: boolean
  brandContentToggle: boolean
  brandOrganicToggle: boolean
  musicUsageConfirmed: boolean
  photoTitle?: string
  autoAddMusic?: boolean
  photoCoverIndex?: number
  videoCoverTimestampMs?: number
  isAigc: boolean
}

export type YouTubePublishingOptions = {
  title: string
  description: string
  privacyStatus: 'private' | 'unlisted' | 'public'
  madeForKids: boolean | null
  containsSyntheticMedia: boolean | null
  notifySubscribers: boolean
  termsAccepted: boolean
  tags?: string[]
  license?: 'youtube' | 'creativeCommon'
  embeddable?: boolean
}

export type InstagramPublishingOptions = {
  commentEnabled: boolean
  shareToFeed: boolean
  locationId?: string
  collaborators?: string[]
  coverReference?: string
  thumbOffset?: number
  audioName?: string
  isAiGenerated?: boolean
  trialReel?: 'MANUAL' | 'SS_PERFORMANCE'
}

export type FacebookPublishingOptions = {
  placeId?: string
  reelTitle?: string
  isAiGenerated?: boolean
}

export type ScheduledPostRecord = {
  id: string
  title: string
  caption: string | null
  notes: string | null
  platforms: ContentPlatform[]
  accountIds: string[]
  status: ContentPostStatus
  publishingError?: string
  publishingDestinations: PublishingDestination[]
  scheduledAt: string
  createdAt: string
  updatedAt: string
  clip: {
    id: string
    title: string
    viralScore: number
    duration: number
    tiktokEligible: boolean
    thumbnailUrl: string | null
  } | null
  media: PublishingMedia[]
  tiktok?: TikTokPublishingOptions
  instagram?: InstagramPublishingOptions
  facebook?: FacebookPublishingOptions
  youtube?: YouTubePublishingOptions
}

export type ScheduledPostMutation = {
  title?: string
  caption?: string | null
  notes?: string | null
  platforms?: ContentPlatform[]
  accountIds?: string[]
  status?: CalendarMutationStatus
  scheduledAt?: Date
  clipId?: string | null
  media?: PublishingMedia[]
  tiktok?: TikTokPublishingOptions
  instagram?: InstagramPublishingOptions
  facebook?: FacebookPublishingOptions
  youtube?: YouTubePublishingOptions
}

export type ValidationIssue = {
  field: string
  message: string
}

type ValidationResult =
  | { success: true; data: ScheduledPostMutation }
  | { success: false; issues: ValidationIssue[] }

const MAX_CAPTION_LENGTH = 5_000
const MAX_NOTES_LENGTH = 2_000
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const RFC3339_DATE_TIME_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|([+-])(\d{2}):(\d{2}))$/
const MUTATION_FIELDS = new Set([
  'title',
  'caption',
  'notes',
  'platforms',
  'accountIds',
  'status',
  'scheduledAt',
  'clipId',
  'media',
  'tiktok',
  'instagram',
  'facebook',
  'youtube'
])
const MEDIA_FIELDS = new Set([
  'type', 'reference', 'name', 'altText', 'crop', 'userTags'
])
const IMAGE_CROP_RATIOS = new Set(['1:1', '4:5', '1.91:1'])
const INSTAGRAM_FIELDS = new Set([
  'commentEnabled',
  'shareToFeed',
  'locationId',
  'collaborators',
  'coverReference',
  'thumbOffset',
  'audioName',
  'isAiGenerated',
  'trialReel'
])
const INSTAGRAM_BOOLEAN_FIELDS = [
  'commentEnabled', 'shareToFeed', 'isAiGenerated'
] as const
const FACEBOOK_FIELDS = new Set(['placeId', 'reelTitle', 'isAiGenerated'])
const TIKTOK_BOOLEAN_FIELDS = [
  'disableComment',
  'disableDuet',
  'disableStitch',
  'brandContentToggle',
  'brandOrganicToggle',
  'musicUsageConfirmed',
  'isAigc'
] as const
const TIKTOK_FIELDS = new Set([
  ...TIKTOK_BOOLEAN_FIELDS,
  'privacyLevel',
  'autoAddMusic',
  'photoTitle',
  'photoCoverIndex',
  'videoCoverTimestampMs'
])
const YOUTUBE_FIELDS = new Set([
  'title',
  'description',
  'privacyStatus',
  'madeForKids',
  'containsSyntheticMedia',
  'notifySubscribers',
  'termsAccepted',
  'tags',
  'license',
  'embeddable'
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFiniteRange(value: unknown, min: number, max: number) {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= min && value <= max
  )
}

function isInstagramUsername(value: unknown): value is string {
  return typeof value === 'string' && /^[a-zA-Z0-9._]{1,30}$/.test(value)
}

function isPublishingMedia(value: unknown): value is PublishingMedia {
  if (
    !isRecord(value) ||
    (value.type !== 'image' && value.type !== 'video') ||
    typeof value.reference !== 'string' || !value.reference ||
    typeof value.name !== 'string' || !value.name ||
    Object.keys(value).some(key => !MEDIA_FIELDS.has(key))
  ) return false

  if (value.type === 'video') {
    return !['altText', 'crop', 'userTags'].some(key => key in value)
  }
  if (
    value.altText !== undefined &&
    (typeof value.altText !== 'string' || Array.from(value.altText).length > 1000)
  ) return false
  if (value.crop !== undefined) {
    const crop = value.crop
    if (
      !isRecord(crop) || Object.keys(crop).length !== 4 ||
      typeof crop.aspectRatio !== 'string' ||
      !IMAGE_CROP_RATIOS.has(crop.aspectRatio) ||
      !isFiniteRange(crop.x, 0, 1) ||
      !isFiniteRange(crop.y, 0, 1) ||
      !isFiniteRange(crop.zoom, 1, 3)
    ) return false
  }
  if (value.userTags !== undefined) {
    if (
      !Array.isArray(value.userTags) || value.userTags.length > 20 ||
      !value.userTags.every(tag =>
        isRecord(tag) && Object.keys(tag).length === 3 &&
        isInstagramUsername(tag.username) &&
        isFiniteRange(tag.x, 0, 1) && isFiniteRange(tag.y, 0, 1)
      )
    ) return false
    const usernames = value.userTags.map(tag => String(tag.username).toLowerCase())
    if (new Set(usernames).size !== usernames.length) return false
  }
  return true
}

function isInstagramPublishingOptions(value: unknown) {
  if (value === undefined) return true
  if (
    !isRecord(value) ||
    Object.keys(value).some(key => !INSTAGRAM_FIELDS.has(key))
  ) return false
  if (!INSTAGRAM_BOOLEAN_FIELDS.every(key =>
    value[key] === undefined || typeof value[key] === 'boolean'
  )) return false
  if (
    value.locationId !== undefined &&
    (typeof value.locationId !== 'string' || !/^\d{1,64}$/.test(value.locationId))
  ) return false
  if (value.collaborators !== undefined) {
    if (
      !Array.isArray(value.collaborators) || value.collaborators.length > 3 ||
      !value.collaborators.every(isInstagramUsername)
    ) return false
    const usernames = value.collaborators.map(name => name.toLowerCase())
    if (new Set(usernames).size !== usernames.length) return false
  }
  if (
    value.coverReference !== undefined &&
    (typeof value.coverReference !== 'string' ||
      !value.coverReference.trim() || value.coverReference.length > 1024)
  ) return false
  if (
    value.thumbOffset !== undefined &&
    (!isFiniteRange(value.thumbOffset, 0, 900_000) || !Number.isInteger(value.thumbOffset))
  ) return false
  if (
    value.audioName !== undefined &&
    (typeof value.audioName !== 'string' || Array.from(value.audioName).length > 100)
  ) return false
  return (
    value.trialReel === undefined ||
    value.trialReel === 'MANUAL' ||
    value.trialReel === 'SS_PERFORMANCE'
  )
}

function isFacebookPublishingOptions(value: unknown): value is FacebookPublishingOptions {
  if (!isRecord(value) || Object.keys(value).some(key => !FACEBOOK_FIELDS.has(key))) {
    return false
  }
  if (
    value.placeId !== undefined &&
    (typeof value.placeId !== 'string' || !/^\d{1,64}$/.test(value.placeId))
  ) return false
  if (
    value.reelTitle !== undefined &&
    (typeof value.reelTitle !== 'string' || Array.from(value.reelTitle).length > 255)
  ) return false
  return value.isAiGenerated === undefined || typeof value.isAiGenerated === 'boolean'
}

function isYouTubeTags(value: unknown): value is string[] {
  if (!Array.isArray(value)) return false
  let characters = Math.max(0, value.length - 1)
  for (const tag of value) {
    if (typeof tag !== 'string' || !tag.trim()) return false
    characters += Array.from(tag).length + (tag.includes(' ') ? 2 : 0)
  }
  return characters <= 500
}

function isLeapYear(year: number) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
}

export function parseAbsoluteDateTime(value: unknown): Date | null {
  if (typeof value !== 'string') return null

  const match = RFC3339_DATE_TIME_PATTERN.exec(value)
  if (!match) return null

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const hour = Number(match[4])
  const minute = Number(match[5])
  const second = Number(match[6])
  const offsetHour = match[10] ? Number(match[10]) : 0
  const offsetMinute = match[11] ? Number(match[11]) : 0
  const daysInMonth = [
    31,
    isLeapYear(year) ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31
  ]

  if (
    year === 0 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > (daysInMonth[month - 1] ?? 0) ||
    hour > 23 ||
    minute > 59 ||
    second > 59 ||
    offsetHour > 14 ||
    offsetMinute > 59 ||
    (offsetHour === 14 && offsetMinute !== 0)
  ) {
    return null
  }

  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function parseNullableText(
  payload: Record<string, unknown>,
  field: 'caption' | 'notes',
  maxLength: number,
  issues: ValidationIssue[]
) {
  if (!(field in payload)) return undefined
  const value = payload[field]
  if (value === null || value === '') return null
  if (typeof value !== 'string') {
    issues.push({ field, message: `${field} must be text` })
    return undefined
  }
  const normalized = value.trim()
  if (normalized.length > maxLength) {
    issues.push({
      field,
      message: `${field} must be ${maxLength.toLocaleString('en-US')} characters or fewer`
    })
    return undefined
  }
  return normalized || null
}

export function validateScheduledPostPayload(
  value: unknown,
  mode: 'create' | 'update'
): ValidationResult {
  if (!isRecord(value)) {
    return {
      success: false,
      issues: [{ field: 'body', message: 'Request body must be an object' }]
    }
  }

  const issues: ValidationIssue[] = []
  const data: ScheduledPostMutation = {}
  const unknownFields = Object.keys(value).filter(
    (field) => !MUTATION_FIELDS.has(field)
  )
  if (unknownFields.length > 0) {
    issues.push({
      field: 'body',
      message: `Unsupported field${unknownFields.length === 1 ? '' : 's'}: ${unknownFields.join(', ')}`
    })
  }

  if (mode === 'create' || 'title' in value) {
    if (typeof value.title !== 'string' || value.title.trim().length === 0) {
      issues.push({ field: 'title', message: 'Title is required' })
    } else if (value.title.trim().length > 120) {
      issues.push({
        field: 'title',
        message: 'Title must be 120 characters or fewer'
      })
    } else {
      data.title = value.title.trim()
    }
  }

  const caption = parseNullableText(
    value,
    'caption',
    MAX_CAPTION_LENGTH,
    issues
  )
  if ('caption' in value && caption !== undefined) data.caption = caption

  const notes = parseNullableText(value, 'notes', MAX_NOTES_LENGTH, issues)
  if ('notes' in value && notes !== undefined) data.notes = notes

  if (mode === 'create' || 'platforms' in value) {
    if (!Array.isArray(value.platforms)) {
      issues.push({
        field: 'platforms',
        message: 'Choose at least one platform'
      })
    } else {
      const platforms = [
        ...new Set(
          value.platforms
            .filter(
              (platform): platform is string => typeof platform === 'string'
            )
            .map((platform) => platform.toLowerCase().trim())
        )
      ]
      const invalid = platforms.filter(
        (platform) => !CONTENT_PLATFORMS.includes(platform as ContentPlatform)
      )
      if (
        platforms.length === 0 ||
        platforms.length !== value.platforms.length ||
        invalid.length > 0
      ) {
        issues.push({
          field: 'platforms',
          message: 'Choose one or more supported platforms'
        })
      } else {
        data.platforms = platforms as ContentPlatform[]
      }
    }
  }

  if (mode === 'create' || 'status' in value) {
    const status =
      mode === 'create' && value.status === undefined ? 'draft' : value.status
    if (
      typeof status !== 'string' ||
      !['draft', 'scheduled', 'publish'].includes(status)
    ) {
      issues.push({ field: 'status', message: 'Choose a valid status' })
    } else {
      data.status = status as CalendarMutationStatus
    }
  }

  if (mode === 'create' || 'accountIds' in value) {
    if (!Array.isArray(value.accountIds)) {
      issues.push({
        field: 'accountIds',
        message: 'Choose at least one connected account'
      })
    } else {
      const accountIds = value.accountIds.filter(
        (accountId): accountId is string =>
          typeof accountId === 'string' && UUID_PATTERN.test(accountId)
      )
      if (
        accountIds.length !== value.accountIds.length ||
        new Set(accountIds).size !== accountIds.length ||
        accountIds.length > 10
      ) {
        issues.push({
          field: 'accountIds',
          message: 'Choose valid connected accounts'
        })
      } else {
        data.accountIds = accountIds
      }
    }
  }

  if (mode === 'create' || 'scheduledAt' in value) {
    if (typeof value.scheduledAt !== 'string') {
      issues.push({
        field: 'scheduledAt',
        message: 'Choose a date and time with a time zone'
      })
    } else {
      const scheduledAt = parseAbsoluteDateTime(value.scheduledAt)
      if (!scheduledAt) {
        issues.push({
          field: 'scheduledAt',
          message: 'Choose a valid date and time with a time zone'
        })
      } else {
        data.scheduledAt = scheduledAt
      }
    }
  }

  if ('clipId' in value) {
    if (value.clipId === null || value.clipId === '') {
      data.clipId = null
    } else if (
      typeof value.clipId !== 'string' ||
      !UUID_PATTERN.test(value.clipId)
    ) {
      issues.push({ field: 'clipId', message: 'Choose a valid clip' })
    } else {
      data.clipId = value.clipId
    }
  }

  if ('media' in value) {
    const media = value.media
    if (
      !Array.isArray(media) ||
      media.length > 35 ||
      !media.every(isPublishingMedia)
    ) {
      issues.push({
        field: 'media',
        message: 'Choose up to 35 images or videos'
      })
    } else {
      data.media = media as PublishingMedia[]
      if (data.platforms?.includes('instagram')) {
        const imageFormats = new Set(data.media.filter(item => item.type === 'image').map(item => item.crop?.aspectRatio ?? 'original'))
        if (imageFormats.size > 1) {
          issues.push({ field: 'media', message: 'Choose one photo format for the Instagram carousel' })
        }
      }
    }
  }

  if ('tiktok' in value) {
    const tiktok = value.tiktok
    const valid =
      isRecord(tiktok) &&
      Object.keys(tiktok).every(key => TIKTOK_FIELDS.has(key)) &&
      (tiktok.photoTitle === undefined ||
        (typeof tiktok.photoTitle === 'string' &&
          tiktok.photoTitle.length <= 90)) &&
      (tiktok.autoAddMusic === undefined ||
        typeof tiktok.autoAddMusic === 'boolean') &&
      (tiktok.photoCoverIndex === undefined ||
        (isFiniteRange(tiktok.photoCoverIndex, 0, 34) &&
          Number.isInteger(tiktok.photoCoverIndex))) &&
      (tiktok.videoCoverTimestampMs === undefined ||
        (isFiniteRange(tiktok.videoCoverTimestampMs, 0, Number.MAX_SAFE_INTEGER) &&
          Number.isInteger(tiktok.videoCoverTimestampMs))) &&
      typeof tiktok.privacyLevel === 'string' &&
      (data.status === 'draft' || tiktok.privacyLevel.length > 0) &&
      TIKTOK_BOOLEAN_FIELDS.every(field => typeof tiktok[field] === 'boolean')
    if (!valid) {
      issues.push({
        field: 'tiktok',
        message: 'Choose valid TikTok publishing settings'
      })
    } else {
      data.tiktok = tiktok as TikTokPublishingOptions
    }
  }

  if ('youtube' in value) {
    const youtube = value.youtube
    if (!isRecord(youtube) || Object.keys(youtube).some(key => !YOUTUBE_FIELDS.has(key)) ||
      typeof youtube.title !== 'string' || Array.from(youtube.title).length > 100 || /[<>]/.test(youtube.title) ||
      typeof youtube.description !== 'string' || new TextEncoder().encode(youtube.description).length > 5000 || /[<>]/.test(youtube.description) ||
      !['private', 'unlisted', 'public'].includes(String(youtube.privacyStatus)) ||
      !['madeForKids', 'containsSyntheticMedia'].every(key => typeof youtube[key] === 'boolean' || (data.status === 'draft' && youtube[key] === null)) ||
      typeof youtube.notifySubscribers !== 'boolean' || typeof youtube.termsAccepted !== 'boolean' ||
      (youtube.tags !== undefined && !isYouTubeTags(youtube.tags)) ||
      (youtube.license !== undefined && youtube.license !== 'youtube' && youtube.license !== 'creativeCommon') ||
      (youtube.embeddable !== undefined && typeof youtube.embeddable !== 'boolean') ||
      (data.status !== 'draft' && (!youtube.title.trim() || youtube.termsAccepted !== true))) {
      issues.push({ field: 'youtube', message: 'Review all YouTube publishing settings.' })
    } else data.youtube = youtube as YouTubePublishingOptions
  }

  if ('instagram' in value) {
    const instagram = value.instagram as Record<string, unknown> | undefined
    if (!isInstagramPublishingOptions(instagram)) {
      issues.push({
        field: 'instagram',
        message: 'Choose valid Instagram publishing settings'
      })
    } else if (instagram) {
      data.instagram = instagram as InstagramPublishingOptions
    }
  }

  if ('facebook' in value) {
    if (!isFacebookPublishingOptions(value.facebook)) {
      issues.push({
        field: 'facebook',
        message: 'Choose valid Facebook publishing settings'
      })
    } else {
      data.facebook = value.facebook
    }
  }

  if (
    mode === 'update' &&
    Object.keys(data).length === 0 &&
    issues.length === 0
  ) {
    issues.push({
      field: 'body',
      message: 'Provide at least one field to update'
    })
  }

  if (issues.length > 0) return { success: false, issues }
  return { success: true, data }
}
