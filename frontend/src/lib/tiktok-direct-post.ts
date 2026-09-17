import type {
  CalendarClipOption,
  TikTokPublishingOptions
} from './content-calendar'
import type { CreatorOptions, PublishingData } from './publishing'

export type TikTokDirectPostSettings = {
  privacyLevel: string
  allowComment: boolean
  allowDuet: boolean
  allowStitch: boolean
  commercialContent: boolean
  ownBrand: boolean
  brandedContent: boolean
  policyConsent: boolean
  isAigc: boolean
}

export const INITIAL_TIKTOK_SETTINGS: TikTokDirectPostSettings = {
  privacyLevel: '',
  allowComment: false,
  allowDuet: false,
  allowStitch: false,
  commercialContent: false,
  ownBrand: false,
  brandedContent: false,
  policyConsent: false,
  isAigc: false
}

export function resolveCalendarTikTokClip({
  calendarClips,
  clipId,
  publishingClips
}: {
  calendarClips: CalendarClipOption[]
  clipId: string
  publishingClips: PublishingData['clips']
}): PublishingData['clips'][number] | undefined {
  const currentClip = publishingClips.find((clip) => clip.id === clipId)
  if (currentClip) return currentClip

  const calendarClip = calendarClips.find((clip) => clip.id === clipId)
  if (!calendarClip) return undefined
  return {
    id: calendarClip.id,
    title: calendarClip.title,
    duration: calendarClip.duration,
    tiktokEligible: calendarClip.tiktokEligible,
    thumbnailUrl: calendarClip.thumbnailUrl ?? undefined,
    captionTiktok: calendarClip.captionTiktok ?? undefined
  }
}

export type TikTokDirectPostValidationInput = {
  accountId: string
  caption: string
  clip?: {
    duration: number
    tiktokEligible?: boolean
  }
  options: CreatorOptions | null
  settings: TikTokDirectPostSettings
}

export type TikTokDirectPostValidationError =
  | 'accountRequired'
  | 'clipRequired'
  | 'captionRequired'
  | 'captionTooLong'
  | 'creatorOptionsRequired'
  | 'privacyRequired'
  | 'privacyUnavailable'
  | 'clipIneligible'
  | 'clipTooLong'
  | 'commercialTypeRequired'
  | 'brandedContentPrivacy'
  | 'policyConsentRequired'

export function validateTikTokDirectPost({
  accountId,
  caption,
  clip,
  options,
  settings
}: TikTokDirectPostValidationInput): TikTokDirectPostValidationError[] {
  const errors: TikTokDirectPostValidationError[] = []
  if (!accountId) errors.push('accountRequired')
  if (!clip) errors.push('clipRequired')
  if (!caption.trim()) errors.push('captionRequired')
  if (caption.length > 2200) errors.push('captionTooLong')
  if (!options) errors.push('creatorOptionsRequired')
  if (!settings.privacyLevel) errors.push('privacyRequired')
  if (
    options &&
    settings.privacyLevel &&
    !options.privacyLevels.includes(settings.privacyLevel)
  ) {
    errors.push('privacyUnavailable')
  }
  if (clip && clip.tiktokEligible !== true) errors.push('clipIneligible')
  if (clip && options && clip.duration > options.maxDuration) {
    errors.push('clipTooLong')
  }
  if (
    settings.commercialContent &&
    !settings.ownBrand &&
    !settings.brandedContent
  ) {
    errors.push('commercialTypeRequired')
  }
  if (settings.brandedContent && settings.privacyLevel === 'SELF_ONLY') {
    errors.push('brandedContentPrivacy')
  }
  if (!settings.policyConsent) errors.push('policyConsentRequired')
  return errors
}

export function createTikTokPublishingOptions({
  options,
  settings
}: {
  options: CreatorOptions
  settings: TikTokDirectPostSettings
}): TikTokPublishingOptions {
  return {
    privacyLevel: settings.privacyLevel,
    disableComment: !settings.allowComment || options.commentDisabled,
    disableDuet: !settings.allowDuet || options.duetDisabled,
    disableStitch: !settings.allowStitch || options.stitchDisabled,
    brandContentToggle: settings.brandedContent,
    brandOrganicToggle: settings.ownBrand,
    musicUsageConfirmed: settings.policyConsent,
    isAigc: settings.isAigc
  }
}

export function createCalendarTikTokPublishingOptions({
  creatorOptions,
  hasUploadedMedia,
  selectedAccountCount,
  settings,
  status,
  validationErrors
}: {
  creatorOptions: CreatorOptions | null
  hasUploadedMedia: boolean
  selectedAccountCount: number
  settings: TikTokDirectPostSettings
  status: 'draft' | 'scheduled' | 'publish'
  validationErrors: readonly TikTokDirectPostValidationError[]
}): TikTokPublishingOptions | undefined {
  if (selectedAccountCount !== 1 || !creatorOptions) return undefined
  if (status !== 'draft' && (hasUploadedMedia || validationErrors.length > 0)) {
    return undefined
  }
  return createTikTokPublishingOptions({ options: creatorOptions, settings })
}

export function settingsFromTikTokPublishingOptions(
  options?: TikTokPublishingOptions
): TikTokDirectPostSettings {
  if (!options) return { ...INITIAL_TIKTOK_SETTINGS }
  return {
    privacyLevel: options.privacyLevel,
    allowComment: !options.disableComment,
    allowDuet: !options.disableDuet,
    allowStitch: !options.disableStitch,
    commercialContent: options.brandContentToggle || options.brandOrganicToggle,
    ownBrand: options.brandOrganicToggle,
    brandedContent: options.brandContentToggle,
    policyConsent: options.musicUsageConfirmed,
    isAigc: options.isAigc
  }
}
