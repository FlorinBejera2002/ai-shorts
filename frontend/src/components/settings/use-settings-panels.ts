'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useTheme } from '@/components/shared/theme-context'
import { useToast } from '@/components/ui/toast'
import { useApiResource } from '@/hooks/use-api-resource'
import { localizeHref, usePathname, useRouter } from '@/i18n/navigation'
import { extractApiError } from '@/lib/api-error'
import { apiFetch, authClient } from '@/lib/auth'
import type { AccountPreferences, SettingsData } from '@/lib/settings'
import { useLocale, useTranslations } from 'next-intl'
import { useEffect, useRef, useState } from 'react'
import { runExclusive } from './run-exclusive'
import { checked, isSettingsData } from './settings-data'

export type TwoFactorView = 'setup' | 'recovery' | 'manage'
export type NotificationKey = 'emailProduct' | 'emailMarketing' | 'inAppProcessing' | 'inAppPublishing'

interface MutationOptions {
  disabled?: boolean
  acquireMutation?: () => boolean
  releaseMutation?: () => void
}

const SETTINGS_KEY = ['api-resource', '/api/user/settings']

async function mutation<T>(path: string, init: RequestInit, signal: AbortSignal): Promise<T> {
  const response = await apiFetch(path, {
    ...init,
    signal,
    headers: init.body ? { 'Content-Type': 'application/json' } : init.headers
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(extractApiError(result, 'Request failed'))
  return result as T
}

/** Preferences, notifications, two-factor authentication and sessions from `/api/user/settings`. */
export function useSettingsPanels(options: MutationOptions) {
  const resource = useApiResource<SettingsData>('/api/user/settings')
  const { data, error } = checked(resource, isSettingsData)
  const reload = resource.reload
  const queryClient = useQueryClient()
  const t = useTranslations('settings')
  const toast = useToast()
  const locale = useLocale()
  const pathname = usePathname()
  const router = useRouter()
  const { setTheme } = useTheme()
  const [draft, setDraft] = useState<AccountPreferences | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [twoFactorView, setTwoFactorView] = useState<TwoFactorView | null>(null)
  const [mfaCode, setMfaCode] = useState('')
  const [codeError, setCodeError] = useState<string | null>(null)
  const [setup, setSetup] = useState<{ secret: string; provisionerUri: string } | null>(null)
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([])
  const activeMutation = useRef<AbortController | null>(null)
  const saved = data?.preferences ?? null
  const preferences = draft ?? saved
  const disabled = Boolean(options.disabled || busy)

  useEffect(() => () => activeMutation.current?.abort(), [])

  function updateData(update: (previous: SettingsData) => SettingsData) {
    queryClient.setQueryData<SettingsData>(SETTINGS_KEY, (previous) => (previous ? update(previous) : previous))
  }

  /** Request failures become a toast; `onFailure` keeps a failure beside its input instead (wrong 2FA code). */
  async function run(key: string, action: (signal: AbortSignal) => Promise<void>, onFailure?: (message: string) => void) {
    const controller = new AbortController()
    await runExclusive({
      claim: () => !activeMutation.current && !options.disabled && options.acquireMutation?.() !== false,
      onStart: () => {
        activeMutation.current = controller
        setBusy(key)
      },
      onError: (caught) => {
        if (controller.signal.aborted) return
        const message = caught instanceof Error ? caught.message : t('settingsSaveFailed')
        if (onFailure) onFailure(message)
        else toast.add('error', message)
      },
      onFinish: () => {
        activeMutation.current = null
        options.releaseMutation?.()
        if (!controller.signal.aborted) setBusy(null)
      },
      action: () => action(controller.signal)
    })
  }

  function changePreference<Key extends keyof AccountPreferences>(key: Key, value: AccountPreferences[Key]) {
    if (disabled || !preferences) return
    setDraft({ ...preferences, [key]: value })
  }

  function cancelPreferences() {
    if (busy) return
    setDraft(null)
  }

  async function putPreferences(snapshot: AccountPreferences, signal: AbortSignal) {
    const result = await mutation<{ preferences: AccountPreferences }>(
      '/api/user/preferences',
      { method: 'PUT', body: JSON.stringify(snapshot) },
      signal
    )
    updateData((previous) => ({ ...previous, preferences: result.preferences }))
    return result.preferences
  }

  async function savePreferences() {
    const snapshot = draft
    if (!snapshot || !Number.isInteger(snapshot.defaultClipCount) || snapshot.defaultClipCount < 1 || snapshot.defaultClipCount > 10)
      return
    await run('preferences', async (signal) => {
      const next = await putPreferences(snapshot, signal)
      setDraft(null)
      setTheme(next.theme)
      toast.add('success', t('settingsSaved'))
      if (next.locale !== locale)
        router.replace(`${pathname}${window.location.search}`, { locale: next.locale })
    })
  }

  /** Notifications save on toggle; an unsaved Preferences draft keeps the new value too. */
  async function saveNotifications(key: string, changes: Partial<Pick<AccountPreferences, NotificationKey>>, success?: string) {
    if (!saved || disabled) return
    await run(key, async (signal) => {
      await putPreferences({ ...saved, ...changes }, signal)
      setDraft((current) => (current ? { ...current, ...changes } : current))
      if (success) toast.add('success', success)
    })
  }

  function saveNotification(key: NotificationKey, value: boolean) {
    return saveNotifications(`notification-${key}`, { [key]: value })
  }

  /** "Dezabonează-te": every optional e-mail off at once; security e-mails stay on. */
  function unsubscribeOptional() {
    return saveNotifications('unsubscribe', { emailProduct: false, emailMarketing: false }, t('page.unsubscribed'))
  }

  async function openTwoFactor() {
    if (activeMutation.current || options.disabled) return
    setMfaCode('')
    setCodeError(null)
    if (data?.mfa.enabled) {
      setTwoFactorView('manage')
      return
    }
    await run('mfa-setup', async (signal) => {
      const result = await mutation<{ setup: { secret: string; provisionerUri: string } }>(
        '/api/user/mfa/setup',
        { method: 'POST' },
        signal
      )
      setSetup(result.setup)
      setTwoFactorView('setup')
    })
  }

  function closeTwoFactor() {
    if (busy) return
    setTwoFactorView(null)
    setMfaCode('')
    setRecoveryCodes([])
    setCodeError(null)
  }

  async function enableMFA() {
    if (!/^\d{6}$/.test(mfaCode.trim())) return
    setCodeError(null)
    await run('mfa-enable', async (signal) => {
      const result = await mutation<{ recoveryCodes: string[] }>(
        '/api/user/mfa/enable',
        { method: 'POST', body: JSON.stringify({ code: mfaCode.trim() }) },
        signal
      )
      updateData((previous) => ({ ...previous, mfa: { enabled: true } }))
      setRecoveryCodes(result.recoveryCodes)
      setSetup(null)
      setMfaCode('')
      setTwoFactorView('recovery')
      toast.add('success', t('mfaEnabledSuccess'))
    }, setCodeError)
  }

  async function manageMFA(action: 'disable' | 'recovery-codes') {
    if (mfaCode.trim().length < 6) return
    setCodeError(null)
    await run(`mfa-${action}`, async (signal) => {
      const result = await mutation<{ recoveryCodes?: string[] }>(
        `/api/user/mfa/${action}`,
        { method: 'POST', body: JSON.stringify({ code: mfaCode.trim() }) },
        signal
      )
      setMfaCode('')
      if (action === 'disable') {
        updateData((previous) => ({ ...previous, mfa: { enabled: false } }))
        setTwoFactorView(null)
        toast.add('success', t('mfaDisabledSuccess'))
      } else {
        setRecoveryCodes(result.recoveryCodes ?? [])
        setTwoFactorView('recovery')
      }
    }, setCodeError)
  }

  async function revokeSession(id: string, current: boolean) {
    await run(`session-${id}`, async (signal) => {
      await mutation(`/api/user/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' }, signal)
      if (current) {
        authClient.clearSession()
        window.location.assign(localizeHref('/login', locale))
        return
      }
      updateData((previous) => ({ ...previous, sessions: previous.sessions.filter((session) => session.id !== id) }))
      toast.add('success', t('sessionRevoked'))
    })
  }

  async function revokeOthers() {
    await run('sessions', async (signal) => {
      await mutation('/api/user/sessions/revoke-others', { method: 'POST' }, signal)
      updateData((previous) => ({ ...previous, sessions: previous.sessions.filter((session) => session.current) }))
      toast.add('success', t('sessionsRevoked'))
    })
  }

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value)
      toast.add('success', t('panelsDesign.copied'))
    } catch {
      toast.add('error', t('panelsDesign.copyFailed'))
    }
  }

  return {
    data,
    error,
    reload,
    preferences,
    dirty: draft !== null,
    disabled,
    busy,
    codeError,
    changePreference,
    cancelPreferences,
    savePreferences,
    saveNotification,
    unsubscribeOptional,
    twoFactorView,
    setup,
    mfaCode,
    setMfaCode,
    recoveryCodes,
    openTwoFactor,
    closeTwoFactor,
    enableMFA,
    manageMFA,
    revokeSession,
    revokeOthers,
    copy
  }
}

export type SettingsPanelsController = ReturnType<typeof useSettingsPanels>
