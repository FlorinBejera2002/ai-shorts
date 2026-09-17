export const CONTENT_PLATFORMS = [
  'tiktok',
  'instagram',
  'facebook',
  'youtube',
  'linkedin',
  'twitter'
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

export type PublishingMedia = {
  type: 'image' | 'video'
  reference: string
  name: string
}

export type TikTokPublishingOptions = {
  privacyLevel: string
  disableComment: boolean
  disableDuet: boolean
  disableStitch: boolean
  brandContentToggle: boolean
  brandOrganicToggle: boolean
  musicUsageConfirmed: boolean
  isAigc: boolean
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
  'tiktok'
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
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
      media.length > 10 ||
      !media.every(
        (item) =>
          isRecord(item) &&
          (item.type === 'image' || item.type === 'video') &&
          typeof item.reference === 'string' &&
          typeof item.name === 'string' &&
          item.reference.length > 0 &&
          item.name.length > 0 &&
          Object.keys(item).length === 3
      )
    ) {
      issues.push({
        field: 'media',
        message: 'Choose up to 10 images or videos'
      })
    } else {
      data.media = media as PublishingMedia[]
    }
  }

  if ('tiktok' in value) {
    const tiktok = value.tiktok
    const booleanFields = [
      'disableComment',
      'disableDuet',
      'disableStitch',
      'brandContentToggle',
      'brandOrganicToggle',
      'musicUsageConfirmed',
      'isAigc'
    ] as const
    const valid =
      isRecord(tiktok) &&
      Object.keys(tiktok).length === booleanFields.length + 1 &&
      typeof tiktok.privacyLevel === 'string' &&
      (data.status === 'draft' || tiktok.privacyLevel.length > 0) &&
      booleanFields.every((field) => typeof tiktok[field] === 'boolean')
    if (!valid) {
      issues.push({
        field: 'tiktok',
        message: 'Choose valid TikTok publishing settings'
      })
    } else {
      data.tiktok = tiktok as TikTokPublishingOptions
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
