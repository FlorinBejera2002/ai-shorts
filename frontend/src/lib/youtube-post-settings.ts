import type { YouTubePublishingOptions } from './content-calendar'

export function initialYouTubeSettings(
  saved?: YouTubePublishingOptions
): YouTubePublishingOptions {
  return {
    title: '',
    description: '',
    privacyStatus: 'private',
    madeForKids: null,
    containsSyntheticMedia: null,
    notifySubscribers: false,
    tags: [],
    license: 'youtube',
    embeddable: true,
    ...saved,
    termsAccepted: false
  }
}

export function validateYouTubeSettings(
  settings: YouTubePublishingOptions,
  auditApproved: boolean
): boolean {
  return (
    Boolean(settings.title.trim()) &&
    Array.from(settings.title).length <= 100 &&
    !/[<>]/.test(settings.title + settings.description) &&
    new TextEncoder().encode(settings.description).length <= 5000 &&
    ['private', 'unlisted', 'public'].includes(settings.privacyStatus) &&
    (auditApproved || settings.privacyStatus === 'private') &&
    typeof settings.madeForKids === 'boolean' &&
    typeof settings.containsSyntheticMedia === 'boolean' &&
    validateYouTubeAdvancedSettings(settings) &&
    settings.termsAccepted === true
  )
}

export function parseYouTubeTags(value: string): string[] {
  return value.split(',').map(tag => tag.trim()).filter(Boolean)
}

export function validateYouTubeAdvancedSettings(
  settings: YouTubePublishingOptions
): boolean {
  const tags = settings.tags ?? []
  const invalidTag = tags.some(tag =>
    !tag.trim() || /[<>\p{Cc}]/u.test(tag)
  )
  const tagLength = tags.reduce((length, tag) =>
    length + Array.from(tag).length + (tag.includes(' ') ? 2 : 0),
    Math.max(0, tags.length - 1)
  )
  return !invalidTag && tagLength <= 500 &&
    (settings.license === undefined || ['youtube', 'creativeCommon'].includes(settings.license)) &&
    (settings.embeddable === undefined || typeof settings.embeddable === 'boolean')
}
