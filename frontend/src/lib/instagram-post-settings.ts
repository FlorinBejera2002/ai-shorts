import type { InstagramPublishingOptions } from './content-calendar'

export type InstagramPostSettings = {
  commentEnabled: boolean
  shareToFeed: boolean
  locationId: string
  collaboratorsText: string
  coverReference: string
  thumbOffsetSeconds: string
  audioName: string
  isAiGenerated: boolean
  trialReel: 'off' | 'MANUAL' | 'SS_PERFORMANCE'
}

export const INITIAL_INSTAGRAM_SETTINGS: InstagramPostSettings = {
  commentEnabled: true,
  shareToFeed: true,
  locationId: '',
  collaboratorsText: '',
  coverReference: '',
  thumbOffsetSeconds: '',
  audioName: '',
  isAiGenerated: false,
  trialReel: 'off'
}

function collaboratorNames(text: string) {
  return text.split(/[\s,]+/).filter(Boolean).map(name => name.replace(/^@/, ''))
}

export function validateInstagramSettings(settings: InstagramPostSettings, isReel: boolean) {
  const names = collaboratorNames(settings.collaboratorsText)
  if (names.length > 3 || new Set(names.map(name => name.toLowerCase())).size !== names.length ||
    names.some(name => !/^[a-zA-Z0-9._]{1,30}$/.test(name))) return 'instagramCollaboratorsInvalid'
  if (settings.locationId.trim() && !/^\d{1,64}$/.test(settings.locationId.trim())) return 'instagramLocationInvalid'
  if (isReel && Array.from(settings.audioName.trim()).length > 100) return 'instagramAudioInvalid'
  if (isReel && !settings.coverReference && settings.thumbOffsetSeconds.trim()) {
    const seconds = Number(settings.thumbOffsetSeconds)
    if (!Number.isFinite(seconds) || seconds < 0 || seconds > 900) return 'instagramCoverTimeInvalid'
  }
  return null
}

export function createInstagramPublishingOptions(
  settings: InstagramPostSettings,
  isReel = true
): InstagramPublishingOptions {
  const collaborators = collaboratorNames(settings.collaboratorsText)
  return {
    commentEnabled: settings.commentEnabled,
    shareToFeed: settings.shareToFeed,
    ...(settings.locationId.trim() ? { locationId: settings.locationId.trim() } : {}),
    ...(collaborators.length ? { collaborators } : {}),
    isAiGenerated: settings.isAiGenerated,
    ...(isReel && settings.coverReference ? { coverReference: settings.coverReference } : {}),
    ...(isReel && !settings.coverReference && settings.thumbOffsetSeconds.trim()
      ? { thumbOffset: Math.round(Number(settings.thumbOffsetSeconds) * 1000) } : {}),
    ...(isReel && settings.audioName.trim() ? { audioName: settings.audioName.trim() } : {}),
    ...(isReel && settings.trialReel !== 'off' ? { trialReel: settings.trialReel } : {})
  }
}

export function settingsFromInstagramPublishingOptions(
  options?: InstagramPublishingOptions
): InstagramPostSettings {
  return {
    ...INITIAL_INSTAGRAM_SETTINGS,
    commentEnabled: options?.commentEnabled ?? true,
    shareToFeed: options?.shareToFeed ?? true,
    locationId: options?.locationId ?? '',
    collaboratorsText: options?.collaborators?.join(', ') ?? '',
    coverReference: options?.coverReference ?? '',
    thumbOffsetSeconds: options?.thumbOffset === undefined ? '' : String(options.thumbOffset / 1000),
    audioName: options?.audioName ?? '',
    isAiGenerated: options?.isAiGenerated ?? false,
    trialReel: options?.trialReel ?? 'off'
  }
}
