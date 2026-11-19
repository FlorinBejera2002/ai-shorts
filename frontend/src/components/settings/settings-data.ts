import type { PublishingData } from '@/lib/publishing'
import type { SettingsData } from '@/lib/settings'
import type { Profile } from './settings-types'

/*
 * Shape checks for the Settings API responses: an incomplete payload is treated as a load
 * error instead of crashing the page (and the dashboard layout around it).
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isProfile(value: unknown): value is Profile {
  return isRecord(value) && typeof value.email === 'string' && typeof value.createdAt === 'string'
}

export function isProfileResponse(value: unknown): value is { profile: Profile } {
  return isRecord(value) && isProfile(value.profile)
}

export function isSettingsData(value: unknown): value is SettingsData {
  return (
    isRecord(value) &&
    isRecord(value.preferences) &&
    Array.isArray(value.sessions) &&
    isRecord(value.mfa) &&
    Array.isArray(value.exports)
  )
}

export function isPublishingData(value: unknown): value is PublishingData {
  return isRecord(value) && Array.isArray(value.providers) && Array.isArray(value.accounts)
}

/** Valid data, or null with a load error when the payload arrived incomplete. */
export function checked<T>(
  resource: { data: unknown; error: string | null },
  valid: (value: unknown) => value is T
): { data: T | null; error: string | null } {
  if (resource.data === null) return { data: null, error: resource.error }
  return valid(resource.data) ? { data: resource.data, error: null } : { data: null, error: resource.error ?? 'Invalid response' }
}
