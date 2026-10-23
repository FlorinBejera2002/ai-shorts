export type SettingsSection =
  | 'account'
  | 'profile'
  | 'security'
  | 'connections'
  | 'notifications'
  | 'preferences'
  | 'privacy'

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
