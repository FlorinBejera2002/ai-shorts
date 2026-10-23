'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useTheme } from '@/components/shared/theme-context'
import { useApiResource } from '@/hooks/use-api-resource'
import { usePathname, useRouter } from '@/i18n/navigation'
import { extractApiError } from '@/lib/api-error'
import { apiFetch, authClient } from '@/lib/auth'
import type { AccountPreferences, SettingsData } from '@/lib/settings'
import { useLocale, useTranslations } from 'next-intl'
import { useEffect, useRef, useState } from 'react'

type FeedbackGroup = 'preferences' | 'mfa' | 'sessions'
type Feedback = { group: FeedbackGroup; text: string; error: boolean } | null
export type SecurityView = 'password' | 'setup' | 'recovery' | 'sessions'

interface MutationOptions {
  disabled?: boolean
  onBusyChange?: (busy: boolean) => void
  acquireMutation?: () => boolean
  releaseMutation?: () => void
}

async function mutation<T>(
  path: string,
  init: RequestInit,
  signal: AbortSignal
): Promise<T> {
  const response = await apiFetch(path, {
    ...init,
    signal,
    headers: init.body ? { 'Content-Type': 'application/json' } : init.headers
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(extractApiError(result, 'Request failed'))
  return result as T
}

export function useSettingsPanels(options: MutationOptions) {
  const { data, error, reload } =
    useApiResource<SettingsData>('/api/user/settings')
  const queryClient = useQueryClient()
  const t = useTranslations('settings')
  const locale = useLocale()
  const pathname = usePathname()
  const router = useRouter()
  const { setTheme } = useTheme()
  const [draft, setDraft] = useState<AccountPreferences | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<Feedback>(null)
  const [view, setView] = useState<SecurityView>('password')
  const [mfaCode, setMfaCode] = useState('')
  const [setup, setSetup] = useState<{
    secret: string
    provisionerUri: string
  } | null>(null)
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([])
  const activeMutation = useRef<AbortController | null>(null)
  const preferences = draft ?? data?.preferences ?? null
  const disabled = Boolean(options.disabled || busy)

  useEffect(() => () => activeMutation.current?.abort(), [])

  function updateData(update: (previous: SettingsData) => SettingsData) {
    queryClient.setQueryData<SettingsData>(
      ['api-resource', '/api/user/settings'],
      (previous) => (previous ? update(previous) : previous)
    )
  }

  async function run(
    key: string,
    group: FeedbackGroup,
    action: (signal: AbortSignal) => Promise<void>
  ) {
    if (
      activeMutation.current ||
      options.disabled ||
      options.acquireMutation?.() === false
    )
      return
    const controller = new AbortController()
    activeMutation.current = controller
    setBusy(key)
    setFeedback(null)
    options.onBusyChange?.(true)
    try {
      await action(controller.signal)
    } catch (caught) {
      if (!controller.signal.aborted) {
        setFeedback({
          group,
          error: true,
          text:
            caught instanceof Error ? caught.message : t('settingsSaveFailed')
        })
      }
    } finally {
      activeMutation.current = null
      options.releaseMutation?.()
      options.onBusyChange?.(false)
      if (!controller.signal.aborted) setBusy(null)
    }
  }

  function changePreference<Key extends keyof AccountPreferences>(
    key: Key,
    value: AccountPreferences[Key]
  ) {
    if (disabled || !preferences) return
    setDraft({ ...preferences, [key]: value })
    if (feedback?.group === 'preferences') setFeedback(null)
  }

  async function savePreferences() {
    if (
      !preferences ||
      !Number.isInteger(preferences.defaultClipCount) ||
      preferences.defaultClipCount < 1 ||
      preferences.defaultClipCount > 10
    )
      return
    const snapshot = preferences
    await run('preferences', 'preferences', async (signal) => {
      const result = await mutation<{ preferences: AccountPreferences }>(
        '/api/user/preferences',
        { method: 'PUT', body: JSON.stringify(snapshot) },
        signal
      )
      updateData((previous) => ({
        ...previous,
        preferences: result.preferences
      }))
      setDraft(null)
      setTheme(result.preferences.theme)
      setFeedback({
        group: 'preferences',
        error: false,
        text: t('settingsSaved')
      })
      if (result.preferences.locale !== locale) {
        router.replace(
          `${pathname}${window.location.search}${window.location.hash}`,
          { locale: result.preferences.locale }
        )
      }
    })
  }

  async function beginMFA(restart = false) {
    if (activeMutation.current || options.disabled) return
    if (data?.mfa.enabled) {
      setView('recovery')
      return
    }
    if (setup && !restart) {
      setView('setup')
      return
    }
    await run('mfa-setup', 'mfa', async (signal) => {
      const result = await mutation<{
        setup: { secret: string; provisionerUri: string }
      }>('/api/user/mfa/setup', { method: 'POST' }, signal)
      setSetup(result.setup)
      setMfaCode('')
      setView('setup')
    })
  }

  async function enableMFA() {
    if (!/^\d{6}$/.test(mfaCode.trim())) return
    await run('mfa-enable', 'mfa', async (signal) => {
      const result = await mutation<{ recoveryCodes: string[] }>(
        '/api/user/mfa/enable',
        { method: 'POST', body: JSON.stringify({ code: mfaCode.trim() }) },
        signal
      )
      updateData((previous) => ({ ...previous, mfa: { enabled: true } }))
      setRecoveryCodes(result.recoveryCodes)
      setSetup(null)
      setMfaCode('')
      setView('recovery')
      setFeedback({ group: 'mfa', error: false, text: t('mfaEnabledSuccess') })
      reload()
    })
  }

  async function manageMFA(action: 'disable' | 'recovery-codes') {
    if (mfaCode.trim().length < 6) return
    await run(`mfa-${action}`, 'mfa', async (signal) => {
      const result = await mutation<{ recoveryCodes?: string[] }>(
        `/api/user/mfa/${action}`,
        { method: 'POST', body: JSON.stringify({ code: mfaCode.trim() }) },
        signal
      )
      setMfaCode('')
      setRecoveryCodes(result.recoveryCodes ?? [])
      if (action === 'disable') {
        updateData((previous) => ({ ...previous, mfa: { enabled: false } }))
        setSetup(null)
        setView('password')
        setFeedback({
          group: 'mfa',
          error: false,
          text: t('mfaDisabledSuccess')
        })
      }
      reload()
    })
  }

  async function revokeSession(id: string, current: boolean) {
    await run(`session-${id}`, 'sessions', async (signal) => {
      await mutation(
        `/api/user/sessions/${encodeURIComponent(id)}`,
        { method: 'DELETE' },
        signal
      )
      if (current) {
        authClient.clearSession()
        window.location.assign('/login')
      } else {
        updateData((previous) => ({
          ...previous,
          sessions: previous.sessions.filter((session) => session.id !== id)
        }))
        setFeedback({
          group: 'sessions',
          error: false,
          text: t('sessionRevoked')
        })
        reload()
      }
    })
  }

  async function revokeOthers() {
    await run('sessions', 'sessions', async (signal) => {
      await mutation(
        '/api/user/sessions/revoke-others',
        { method: 'POST' },
        signal
      )
      updateData((previous) => ({
        ...previous,
        sessions: previous.sessions.filter((session) => session.current)
      }))
      setFeedback({
        group: 'sessions',
        error: false,
        text: t('sessionsRevoked')
      })
      reload()
    })
  }

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value)
      setFeedback({
        group: 'mfa',
        error: false,
        text: t('panelsDesign.copied')
      })
    } catch {
      setFeedback({
        group: 'mfa',
        error: true,
        text: t('panelsDesign.copyFailed')
      })
    }
  }

  return {
    data,
    error,
    reload,
    preferences,
    disabled,
    busy,
    feedback,
    view,
    setView,
    setup,
    mfaCode,
    setMfaCode,
    recoveryCodes,
    changePreference,
    savePreferences,
    beginMFA,
    enableMFA,
    manageMFA,
    revokeSession,
    revokeOthers,
    copy
  }
}

export type SettingsPanelsController = ReturnType<typeof useSettingsPanels>
