import {
  Bell,
  Link2,
  LockKeyhole,
  Shield,
  SlidersHorizontal,
  UserRound,
  type LucideIcon
} from 'lucide-react'

export const SETTINGS_SECTIONS = [
  'account',
  'security',
  'connections',
  'notifications',
  'preferences',
  'privacy'
] as const

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number]

/** Navigation label (key in the `settings` namespace) and icon for each section. */
export const SECTION_META: Record<SettingsSection, { label: string; icon: LucideIcon }> = {
  account: { label: 'workspaceDesign.account', icon: UserRound },
  security: { label: 'workspaceDesign.security', icon: LockKeyhole },
  connections: { label: 'connections', icon: Link2 },
  notifications: { label: 'notifications', icon: Bell },
  preferences: { label: 'preferences', icon: SlidersHorizontal },
  privacy: { label: 'workspaceDesign.privacy', icon: Shield }
}

export function parseSettingsSection(value: string | null): SettingsSection | null {
  return SETTINGS_SECTIONS.find((section) => section === value) ?? null
}

/** `null` is the phone menu; desktop treats it as the Account section. */
export function settingsHref(section: SettingsSection | null) {
  return section ? `/dashboard/settings?section=${section}` : '/dashboard/settings'
}

export type Profile = {
  id: string
  name: string | null
  email: string
  image: string | null
  provider: string
  canChangePassword: boolean
  recentlyAuthenticated: boolean
  deletionPending?: boolean
  emailVerified: string | null
  createdAt: string
}
