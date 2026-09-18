import type { InstagramPublishingOptions } from './content-calendar'

export type InstagramPostSettings = {
  commentEnabled: boolean
  shareToFeed: boolean
}

export const INITIAL_INSTAGRAM_SETTINGS: InstagramPostSettings = {
  commentEnabled: true,
  shareToFeed: true
}

export function createInstagramPublishingOptions(
  settings: InstagramPostSettings
): InstagramPublishingOptions {
  return {
    commentEnabled: settings.commentEnabled,
    shareToFeed: settings.shareToFeed
  }
}

export function settingsFromInstagramPublishingOptions(
  options?: InstagramPublishingOptions
): InstagramPostSettings {
  if (!options) return { ...INITIAL_INSTAGRAM_SETTINGS }
  return {
    commentEnabled: options.commentEnabled ?? true,
    shareToFeed: options.shareToFeed ?? true
  }
}
