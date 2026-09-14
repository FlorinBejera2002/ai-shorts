'use client'

import { SettingsSelect } from '@/components/settings/settings-select'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useToast } from '@/components/ui/toast'
import { useApiResource } from '@/hooks/use-api-resource'
import { usePathname, useRouter } from '@/i18n/navigation'
import { extractApiError } from '@/lib/api-error'
import { apiFetch, authClient } from '@/lib/auth'
import type { AccountPreferences, SettingsData } from '@/lib/settings'
import {
  Bell,
  Check,
  Copy,
  Download,
  History,
  KeyRound,
  Laptop,
  Loader2,
  LogOut,
  RefreshCw,
  Save,
  ShieldCheck,
  Smartphone
} from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useTheme } from 'next-themes'
import { useEffect, useId, useState } from 'react'

const TIMEZONES = [
  'UTC',
  'Europe/Bucharest',
  'Europe/London',
  'Europe/Paris',
  'America/New_York',
  'America/Los_Angeles',
  'Asia/Dubai',
  'Asia/Tokyo'
] as const

async function mutation(path: string, init: RequestInit = {}) {
  const response = await apiFetch(path, {
    ...init,
    headers: init.body ? { 'Content-Type': 'application/json' } : init.headers
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(extractApiError(data, 'Request failed'))
  return data
}

function SwitchRow({
  checked,
  label,
  description,
  onChange
}: {
  checked: boolean
  label: string
  description: string
  onChange: (checked: boolean) => void
}) {
  const id = useId()
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div>
        <Label htmlFor={id} className="cursor-pointer text-sm font-medium">
          {label}
        </Label>
        <p
          id={`${id}-description`}
          className="mt-0.5 text-xs leading-5 text-muted-foreground"
        >
          {description}
        </p>
      </div>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onChange}
        aria-describedby={`${id}-description`}
        className="mt-0.5"
      />
    </div>
  )
}

export function CompleteSettingsPanels() {
  const t = useTranslations('settings')
  const locale = useLocale()
  const router = useRouter()
  const pathname = usePathname()
  const { setTheme } = useTheme()
  const toast = useToast()
  const { data, error, reload } =
    useApiResource<SettingsData>('/api/user/settings')
  const [preferences, setPreferences] = useState<AccountPreferences | null>(
    null
  )
  const [busy, setBusy] = useState<string | null>(null)
  const [mfaCode, setMfaCode] = useState('')
  const [mfaSetup, setMfaSetup] = useState<{
    secret: string
    provisionerUri: string
  } | null>(null)
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([])

  useEffect(() => {
    if (data) setPreferences(data.preferences)
  }, [data])

  const formatDate = (value: string) =>
    new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(new Date(value))

  async function run(key: string, action: () => Promise<void>) {
    setBusy(key)
    try {
      await action()
    } catch (caught) {
      toast.add(
        'error',
        caught instanceof Error ? caught.message : t('settingsSaveFailed')
      )
    } finally {
      setBusy(null)
    }
  }

  async function savePreferences() {
    if (!preferences) return
    await run('preferences', async () => {
      await mutation('/api/user/preferences', {
        method: 'PUT',
        body: JSON.stringify(preferences)
      })
      setTheme(preferences.theme)
      toast.add('success', t('settingsSaved'))
      if (preferences.locale !== locale) {
        router.replace(
          `${pathname}${window.location.search}${window.location.hash}`,
          {
            locale: preferences.locale
          }
        )
      } else {
        reload()
      }
    })
  }

  async function beginMFA() {
    await run('mfa-setup', async () => {
      const result = await mutation('/api/user/mfa/setup', { method: 'POST' })
      setMfaSetup(result.setup)
      setMfaCode('')
    })
  }

  async function enableMFA() {
    await run('mfa-enable', async () => {
      const result = await mutation('/api/user/mfa/enable', {
        method: 'POST',
        body: JSON.stringify({ code: mfaCode })
      })
      setRecoveryCodes(result.recoveryCodes)
      setMfaSetup(null)
      setMfaCode('')
      reload()
      toast.add('success', t('mfaEnabledSuccess'))
    })
  }

  async function disableMFA() {
    await run('mfa-disable', async () => {
      await mutation('/api/user/mfa/disable', {
        method: 'POST',
        body: JSON.stringify({ code: mfaCode })
      })
      setMfaCode('')
      setRecoveryCodes([])
      reload()
      toast.add('success', t('mfaDisabledSuccess'))
    })
  }

  async function regenerateCodes() {
    await run('mfa-codes', async () => {
      const result = await mutation('/api/user/mfa/recovery-codes', {
        method: 'POST',
        body: JSON.stringify({ code: mfaCode })
      })
      setRecoveryCodes(result.recoveryCodes)
      setMfaCode('')
    })
  }

  async function revokeSession(id: string, current: boolean) {
    await run(`session-${id}`, async () => {
      await mutation(`/api/user/sessions/${id}`, { method: 'DELETE' })
      if (current) {
        authClient.clearSession()
        window.location.assign('/login')
      } else {
        reload()
        toast.add('success', t('sessionRevoked'))
      }
    })
  }

  async function revokeOthers() {
    await run('sessions', async () => {
      await mutation('/api/user/sessions/revoke-others', { method: 'POST' })
      reload()
      toast.add('success', t('sessionsRevoked'))
    })
  }

  if (!data || !preferences) {
    return (
      <Card as="section" className="order-4 min-w-0 block p-4 sm:p-5">
        <div
          role={error ? 'alert' : 'status'}
          className="flex min-h-24 items-center justify-center text-sm text-muted-foreground"
        >
          {error ? (
            <div className="text-center">
              <p>{t('settingsLoadFailed')}</p>
              <Button
                variant="ghost"
                size="sm"
                className="mt-2"
                onClick={reload}
              >
                <RefreshCw className="size-4" /> {t('retry')}
              </Button>
            </div>
          ) : (
            <>
              <Loader2 className="mr-2 size-4 animate-spin motion-reduce:animate-none" />
              {t('settingsLoading')}
            </>
          )}
        </div>
      </Card>
    )
  }

  return (
    <>
      <Card as="section" className="order-4 min-w-0 block gap-0 p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <div className="icon-tile">
            <ShieldCheck className="size-4" />
          </div>
          <div>
            <h3 className="text-sm font-medium">{t('twoFactor')}</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {t('twoFactorDesc')}
            </p>
          </div>
        </div>
        <div className="mt-5 rounded-md border border-border p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">{t('authenticatorApp')}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {data.mfa.enabled ? t('mfaOn') : t('mfaOff')}
              </p>
            </div>
            <span
              className={`rounded-sm px-2.5 py-1 text-[11px] font-semibold ${data.mfa.enabled ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'}`}
            >
              {data.mfa.enabled ? t('enabled') : t('disabled')}
            </span>
          </div>
          {!data.mfa.enabled && !mfaSetup && (
            <Button
              className="mt-4"
              onClick={() => void beginMFA()}
              disabled={busy !== null}
            >
              {busy === 'mfa-setup' ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <KeyRound className="size-4" />
              )}
              {t('setUpTwoFactor')}
            </Button>
          )}
          {mfaSetup && (
            <div className="mt-4 space-y-4 rounded-md bg-muted/40 p-4">
              <p className="text-xs leading-5 text-muted-foreground">
                {t('mfaSetupHint')}
              </p>
              <div>
                <Label htmlFor="mfa-secret">{t('manualKey')}</Label>
                <div className="mt-1 flex gap-2">
                  <Input
                    id="mfa-secret"
                    readOnly={true}
                    value={mfaSetup.secret}
                    className="font-mono"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label={t('copy')}
                    onClick={() =>
                      void navigator.clipboard.writeText(mfaSetup.secret)
                    }
                  >
                    <Copy className="size-4" />
                  </Button>
                </div>
              </div>
              <Label htmlFor="mfa-confirm-code">{t('verificationCode')}</Label>
              <Input
                id="mfa-confirm-code"
                value={mfaCode}
                onChange={(event) => setMfaCode(event.target.value)}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={19}
              />
              <Button
                onClick={() => void enableMFA()}
                disabled={busy !== null || mfaCode.length < 6}
              >
                {busy === 'mfa-enable' && (
                  <Loader2 className="size-4 animate-spin" />
                )}
                {t('confirmTwoFactor')}
              </Button>
            </div>
          )}
          {data.mfa.enabled && (
            <div className="mt-4 flex flex-wrap items-end gap-2">
              <div className="min-w-52 flex-1">
                <Label htmlFor="mfa-action-code">
                  {t('verificationOrRecoveryCode')}
                </Label>
                <Input
                  id="mfa-action-code"
                  className="mt-1"
                  value={mfaCode}
                  onChange={(event) => setMfaCode(event.target.value)}
                  autoComplete="one-time-code"
                  maxLength={19}
                />
              </div>
              <Button
                variant="outline"
                onClick={() => void regenerateCodes()}
                disabled={busy !== null || mfaCode.length < 6}
              >
                {t('newRecoveryCodes')}
              </Button>
              <Button
                variant="destructive"
                onClick={() => void disableMFA()}
                disabled={busy !== null || mfaCode.length < 6}
              >
                {t('disableTwoFactor')}
              </Button>
            </div>
          )}
          {recoveryCodes.length > 0 && (
            <output className="mt-4 block rounded-md border border-warning/30 bg-warning/10 p-4">
              <p className="text-sm font-semibold">{t('saveRecoveryCodes')}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t('recoveryCodesOnce')}
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2 font-mono text-xs sm:grid-cols-3">
                {recoveryCodes.map((code) => (
                  <code key={code}>{code}</code>
                ))}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() =>
                  void navigator.clipboard.writeText(recoveryCodes.join('\n'))
                }
              >
                <Copy className="size-4" />
                {t('copyAll')}
              </Button>
            </output>
          )}
        </div>

        <div className="mt-7 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="text-sm font-medium">{t('activeSessions')}</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {t('activeSessionsDesc')}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void revokeOthers()}
            disabled={busy !== null || data.sessions.length < 2}
          >
            <LogOut className="size-4" />
            {t('revokeOthers')}
          </Button>
        </div>
        <ul className="mt-4 divide-y divide-border rounded-md border border-border">
          {data.sessions.map((session) => (
            <li
              key={session.id}
              className="flex flex-wrap items-center gap-3 p-4"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted">
                {session.device.includes('iOS') ||
                session.device.includes('Android') ? (
                  <Smartphone className="size-4" />
                ) : (
                  <Laptop className="size-4" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  {session.device}
                  {session.current && (
                    <span className="ml-2 text-xs text-success">
                      {t('currentSession')}
                    </span>
                  )}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {t('lastActive', { date: formatDate(session.lastSeenAt) })}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void revokeSession(session.id, session.current)}
                disabled={busy !== null}
              >
                {busy === `session-${session.id}` ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  t('revoke')
                )}
              </Button>
            </li>
          ))}
        </ul>

        <details className="mt-5 rounded-md border border-border p-4">
          <summary className="cursor-pointer text-sm font-medium">
            {t('securityActivity')}
          </summary>
          {data.securityEvents.length ? (
            <ul className="mt-3 space-y-3">
              {data.securityEvents.map((event) => (
                <li key={event.id} className="flex items-start gap-3 text-xs">
                  <History className="mt-0.5 size-3.5 text-muted-foreground" />
                  <span className="flex-1">{event.detail}</span>
                  <time className="text-muted-foreground">
                    {formatDate(event.createdAt)}
                  </time>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-xs text-muted-foreground">
              {t('noSecurityActivity')}
            </p>
          )}
        </details>
      </Card>

      <Card
        as="section"
        className="order-6 min-w-0 block gap-0 p-4 sm:p-5"
        aria-labelledby="notifications-title"
      >
        <div className="flex items-start gap-3">
          <div className="icon-tile">
            <Bell className="size-4" />
          </div>
          <div>
            <h2
              id="notifications-title"
              className="scroll-mt-24 text-sm font-medium"
            >
              {t('notifications')}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {t('notificationsDesc')}
            </p>
          </div>
        </div>
        <div className="mt-4 divide-y divide-border">
          <SwitchRow
            checked={preferences.emailSecurity}
            label={t('securityEmails')}
            description={t('securityEmailsDesc')}
            onChange={(value) =>
              setPreferences({ ...preferences, emailSecurity: value })
            }
          />
          <SwitchRow
            checked={preferences.emailProduct}
            label={t('productEmails')}
            description={t('productEmailsDesc')}
            onChange={(value) =>
              setPreferences({ ...preferences, emailProduct: value })
            }
          />
          <SwitchRow
            checked={preferences.emailMarketing}
            label={t('marketingEmails')}
            description={t('marketingEmailsDesc')}
            onChange={(value) =>
              setPreferences({ ...preferences, emailMarketing: value })
            }
          />
          <SwitchRow
            checked={preferences.inAppProcessing}
            label={t('processingNotifications')}
            description={t('processingNotificationsDesc')}
            onChange={(value) =>
              setPreferences({ ...preferences, inAppProcessing: value })
            }
          />
          <SwitchRow
            checked={preferences.inAppPublishing}
            label={t('publishingNotifications')}
            description={t('publishingNotificationsDesc')}
            onChange={(value) =>
              setPreferences({ ...preferences, inAppPublishing: value })
            }
          />
        </div>
      </Card>

      <Card
        as="section"
        className="order-7 min-w-0 block gap-0 p-4 sm:p-5"
        aria-labelledby="preferences-title"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2
              id="preferences-title"
              className="scroll-mt-24 text-sm font-medium"
            >
              {t('preferences')}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {t('productPreferencesDesc')}
            </p>
          </div>
          <Check className="size-4 text-primary" />
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <SettingsSelect
            id="settings-locale"
            label={t('language')}
            value={preferences.locale}
            options={[
              { value: 'en', label: 'English' },
              { value: 'ro', label: 'Română' }
            ]}
            onChange={(locale: AccountPreferences['locale']) =>
              setPreferences({ ...preferences, locale })
            }
          />
          <SettingsSelect
            id="settings-theme"
            label={t('theme')}
            value={preferences.theme}
            options={[
              { value: 'system', label: t('themeSystem') },
              { value: 'light', label: t('themeLight') },
              { value: 'dark', label: t('themeDark') }
            ]}
            onChange={(theme: AccountPreferences['theme']) =>
              setPreferences({ ...preferences, theme })
            }
          />
          <SettingsSelect
            id="settings-timezone"
            label={t('timezone')}
            value={preferences.timezone}
            options={Array.from(
              new Set([...TIMEZONES, preferences.timezone])
            ).map((zone) => ({ value: zone, label: zone }))}
            onChange={(timezone) =>
              setPreferences({ ...preferences, timezone })
            }
          />
          <SettingsSelect
            id="settings-aspect"
            label={t('defaultAspectRatio')}
            value={preferences.defaultAspectRatio}
            options={[
              { value: '9:16', label: '9:16' },
              { value: '1:1', label: '1:1' },
              { value: '16:9', label: '16:9' }
            ]}
            onChange={(
              defaultAspectRatio: AccountPreferences['defaultAspectRatio']
            ) => setPreferences({ ...preferences, defaultAspectRatio })}
          />
          <div>
            <Label htmlFor="settings-clips">{t('defaultClipCount')}</Label>
            <Input
              id="settings-clips"
              type="number"
              min={1}
              max={10}
              value={preferences.defaultClipCount}
              onChange={(event) =>
                setPreferences({
                  ...preferences,
                  defaultClipCount: Number(event.target.value)
                })
              }
              className="mt-1.5"
            />
          </div>
        </div>
        <Button
          className="mt-5"
          onClick={() => void savePreferences()}
          disabled={busy !== null}
        >
          {busy === 'preferences' ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Save className="size-4" />
          )}
          {t('savePreferences')}
        </Button>
      </Card>

      <Card as="section" className="order-9 min-w-0 block gap-0 p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <div className="icon-tile">
            <Download className="size-4" />
          </div>
          <div>
            <h3 className="text-sm font-medium">{t('exportHistory')}</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {t('exportHistoryDesc')}
            </p>
          </div>
        </div>
        {data.exports.length ? (
          <ul className="mt-4 divide-y divide-border rounded-md border border-border">
            {data.exports.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between gap-3 p-3 text-xs"
              >
                <span>{formatDate(item.requestedAt)}</span>
                <span className="rounded-sm bg-muted px-2 py-1 font-medium">
                  {t(`exportStatus.${item.status}`)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-xs text-muted-foreground">{t('noExports')}</p>
        )}
      </Card>
    </>
  )
}
