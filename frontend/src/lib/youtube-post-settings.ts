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
    settings.termsAccepted === true
  )
}
