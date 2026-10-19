import type { FacebookPublishingOptions } from './content-calendar'

export type FacebookPostSettings = {
  placeId: string
  reelTitle: string
  isAiGenerated: boolean
}

export function settingsFromFacebookPublishingOptions(
  options?: FacebookPublishingOptions
): FacebookPostSettings {
  return {
    placeId: options?.placeId ?? '',
    reelTitle: options?.reelTitle ?? '',
    isAiGenerated: options?.isAiGenerated ?? false
  }
}

export function validateFacebookSettings(
  settings: FacebookPostSettings,
  isReel: boolean
) {
  if (settings.placeId.trim() && !/^\d{1,64}$/.test(settings.placeId.trim())) {
    return 'facebookPlaceInvalid'
  }
  if (isReel && Array.from(settings.reelTitle.trim()).length > 255) {
    return 'facebookReelTitleInvalid'
  }
  return null
}

export function createFacebookPublishingOptions(
  settings: FacebookPostSettings,
  isReel: boolean
): FacebookPublishingOptions {
  const placeId = settings.placeId.trim()
  const reelTitle = settings.reelTitle.trim()
  return {
    ...(placeId ? { placeId } : {}),
    ...(isReel && reelTitle ? { reelTitle } : {}),
    ...(isReel ? { isAiGenerated: settings.isAiGenerated } : {})
  }
}
