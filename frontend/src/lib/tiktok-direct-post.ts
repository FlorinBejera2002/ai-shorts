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
  autoAddMusic: boolean
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
  autoAddMusic: false,
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
  media?: { type: 'image' | 'video' }[]
  title?: string
  options: CreatorOptions | null
  settings: TikTokDirectPostSettings
}

export type TikTokDirectPostValidationError =
  | 'accountRequired'
  | 'clipRequired'
  | 'photoTitleTooLong'
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
  media = [],
  title = '',
  options,
  settings
}: TikTokDirectPostValidationInput): TikTokDirectPostValidationError[] {
  const errors: TikTokDirectPostValidationError[] = []
  if (!accountId) errors.push('accountRequired')
  const isPhotoPost =
    media.length > 0 && media.every((item) => item.type === 'image')
  if (!clip && media.length === 0) errors.push('clipRequired')
  if (caption.length > (isPhotoPost ? 4000 : 2200))
    errors.push('captionTooLong')
  if (isPhotoPost && title.length > 90) errors.push('photoTitleTooLong')
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
  settings,
  isPhotoPost = false,
  photoTitle = ''
}: {
  isPhotoPost?: boolean
  photoTitle?: string
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
    ...(isPhotoPost
      ? { autoAddMusic: settings.autoAddMusic, photoTitle: photoTitle.trim() }
      : {}),
    isAigc: isPhotoPost ? false : settings.isAigc
  }
}

export function createCalendarTikTokPublishingOptions({
  creatorOptions,
  isPhotoPost = false,
  photoTitle = '',
  selectedAccountCount,
  settings,
  status,
  validationErrors
}: {
  creatorOptions: CreatorOptions | null
  isPhotoPost?: boolean
  photoTitle?: string
  selectedAccountCount: number
  settings: TikTokDirectPostSettings
  status: 'draft' | 'scheduled' | 'publish'
  validationErrors: readonly TikTokDirectPostValidationError[]
}): TikTokPublishingOptions | undefined {
  if (selectedAccountCount !== 1 || !creatorOptions) return undefined
  if (status !== 'draft' && validationErrors.length > 0) {
    return undefined
  }
  return createTikTokPublishingOptions({
    options: creatorOptions,
    settings,
    isPhotoPost,
    photoTitle
  })
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
    autoAddMusic: options.autoAddMusic ?? false,
    isAigc: options.isAigc
  }
}
