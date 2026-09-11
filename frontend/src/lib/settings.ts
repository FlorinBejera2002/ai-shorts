export type AccountPreferences = {
  locale: 'en' | 'ro'
  theme: 'light' | 'dark' | 'system'
  timezone: string
  defaultAspectRatio: '9:16' | '1:1' | '16:9'
  defaultClipCount: number
  emailSecurity: boolean
  emailProduct: boolean
  emailMarketing: boolean
  inAppProcessing: boolean
  inAppPublishing: boolean
}

export type AccountSession = {
  id: string
  device: string
  createdAt: string
  lastSeenAt: string
  expiresAt: string
  current: boolean
}

export type SecurityEvent = {
  id: string
  type: string
  detail: string
  createdAt: string
}

export type DataExport = {
  id: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  requestedAt: string
  completedAt?: string
}

export type SettingsData = {
  preferences: AccountPreferences
  sessions: AccountSession[]
  mfa: { enabled: boolean }
  securityEvents: SecurityEvent[]
  exports: DataExport[]
}
