'use client'

import { Card } from '@/components/ui/card'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

import { LanguageSwitcher } from '@/components/shared/language-switcher'
import { ThemeToggle } from '@/components/shared/theme-toggle'
import { PageHeader } from '@/components/ui/page-header'
import { useToast } from '@/components/ui/toast'
import { Link, useRouter } from '@/i18n/navigation'
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Download,
  Globe,
  KeyRound,
  Loader2,
  LockKeyhole,
  Mail,
  Save,
  Shield,
  Trash2,
  User
} from 'lucide-react'
import { signIn, signOut } from 'next-auth/react'
import { useLocale, useTranslations } from 'next-intl'
import { type FormEvent, useMemo, useRef, useState } from 'react'

type Profile = {
  id: string
  name: string | null
  email: string
  image: string | null
  provider: string
  canChangePassword: boolean
  recentlyAuthenticated: boolean
  emailVerified: string | null
  createdAt: string
}

type BusyAction =
  | 'profile'
  | 'password'
  | 'export'
  | 'delete'
  | 'reauthenticate'
  | null
type ApiIssue = { field?: string; message?: string }

async function responseMessage(response: Response, fallback: string) {
  const data = await response.json().catch(() => null)
  const issue = Array.isArray(data?.issues)
    ? (data.issues as ApiIssue[]).find((item) => item?.message)
    : null
  return typeof issue?.message === 'string'
    ? issue.message
    : typeof data?.error === 'string'
      ? data.error
      : fallback
}

export function AccountSettings({
  initialProfile
}: { initialProfile: Profile }) {
  const t = useTranslations('settings')
  const locale = useLocale()
  const router = useRouter()
  const toast = useToast()
  const deleteDialog = useRef<HTMLDialogElement>(null)
  const [profile, setProfile] = useState(initialProfile)
  const [name, setName] = useState(initialProfile.name ?? '')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [deleteConfirmation, setDeleteConfirmation] = useState('')
  const [deletePassword, setDeletePassword] = useState('')
  const [busy, setBusy] = useState<BusyAction>(null)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const initials = useMemo(() => {
    const source = profile.name?.trim() || profile.email
    return source
      .split(/[\s@._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('')
  }, [profile.email, profile.name])

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy('profile')
    setProfileError(null)
    try {
      const response = await fetch('/api/user/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      })
      if (!response.ok) {
        throw new Error(await responseMessage(response, t('profileSaveFailed')))
      }
      const data = await response.json()
      setProfile((current) => ({ ...current, ...data.profile }))
      setName(data.profile.name ?? '')
      toast.add('success', t('profileSaved'))
      router.refresh()
    } catch (error) {
      setProfileError(
        error instanceof Error ? error.message : t('profileSaveFailed')
      )
    } finally {
      setBusy(null)
    }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy('password')
    setPasswordError(null)
    try {
      const response = await fetch('/api/user/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword })
      })
      if (!response.ok) {
        throw new Error(await responseMessage(response, t('passwordFailed')))
      }
      toast.add('success', t('passwordChanged'))
      await signOut({ redirect: false })
      router.push('/login')
      router.refresh()
    } catch (error) {
      setPasswordError(
        error instanceof Error ? error.message : t('passwordFailed')
      )
      setBusy(null)
    }
  }

  async function exportData() {
    setBusy('export')
    try {
      const response = await fetch('/api/user/data', { cache: 'no-store' })
      if (!response.ok) throw new Error(t('exportFailed'))
      const data = await response.json()
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: 'application/json'
      })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `sneepcut-data-export-${new Date().toISOString().slice(0, 10)}.json`
      document.body.append(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(url)
      toast.add('success', t('exportSuccess'))
    } catch {
      toast.add('error', t('exportFailed'))
    } finally {
      setBusy(null)
    }
  }

  function openDeleteDialog() {
    setDeleteConfirmation('')
    setDeletePassword('')
    setDeleteError(null)
    deleteDialog.current?.showModal()
  }

  async function reauthenticateForDeletion() {
    setBusy('reauthenticate')
    setDeleteError(null)
    try {
      await signIn(
        profile.provider,
        { callbackUrl: window.location.pathname },
        { prompt: 'select_account', max_age: '0' }
      )
      setBusy(null)
    } catch {
      setDeleteError(t('reauthenticationFailed'))
      setBusy(null)
    }
  }

  async function deleteAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy('delete')
    setDeleteError(null)
    try {
      const response = await fetch('/api/user/data', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          credentialAccount
            ? {
                confirmation: deleteConfirmation,
                currentPassword: deletePassword
              }
            : { confirmation: deleteConfirmation }
        )
      })
      if (!response.ok) {
        throw new Error(await responseMessage(response, t('deleteFailed')))
      }
      deleteDialog.current?.close()
      toast.add('success', t('deleteSuccess'))
      await signOut({ redirect: false })
      router.push('/login')
      router.refresh()
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : t('deleteFailed'))
      setBusy(null)
    }
  }

  const joinedDate = new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium'
  }).format(new Date(profile.createdAt))
  const credentialAccount = profile.canChangePassword

  return (
    <div className="animate-fade-in">
      <PageHeader title={t('title')} description={t('desc')} />

      <nav aria-label={t('title')} className="mb-6 flex flex-wrap gap-2">
        {[
          ['profile-title', t('profileTitle')],
          ['security-title', t('securityTitle')],
          ['privacy-title', t('dataPrivacy')],
          ['preferences-title', t('preferences')]
        ].map(([id, label]) => (
          <Button key={id} asChild={true} variant="outline" size="sm">
            <a href={`#${id}`}>{label}</a>
          </Button>
        ))}
      </nav>
      <div className="grid min-w-0 grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(18rem,.7fr)]">
        <div className="min-w-0 space-y-5">
          <Card
            as="section"
            className="block gap-0 py-0 p-5 sm:p-6"
            aria-labelledby="profile-title"
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex min-w-0 max-w-full items-center gap-4">
                {profile.image ? (
                  <img
                    src={profile.image}
                    alt=""
                    className="h-14 w-14 rounded-2xl border border-border object-cover"
                  />
                ) : (
                  <div
                    className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-base font-bold text-primary"
                    aria-hidden="true"
                  >
                    {initials}
                  </div>
                )}
                <div className="min-w-0">
                  <h2
                    id="profile-title"
                    className="scroll-mt-24 text-base font-semibold"
                  >
                    {t('profileTitle')}
                  </h2>
                  <p className="mt-1 truncate text-sm text-muted-foreground">
                    {profile.email}
                  </p>
                </div>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/60 px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
                <Shield className="h-3 w-3" aria-hidden="true" />
                {credentialAccount
                  ? t('credentialsProvider')
                  : t('providerAccount', { provider: profile.provider })}
              </span>
            </div>

            <form className="mt-6 space-y-4" onSubmit={saveProfile}>
              <div>
                <Label htmlFor="profile-name" className="field-label">
                  {t('displayName')}
                </Label>
                <Input
                  id="profile-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  minLength={2}
                  maxLength={80}
                  autoComplete="name"
                  disabled={busy !== null}
                  className="field-input mt-1.5"
                  aria-describedby={profileError ? 'profile-error' : undefined}
                />
              </div>
              <div>
                <Label htmlFor="profile-email" className="field-label">
                  {t('emailAddress')}
                </Label>
                <div className="relative mt-1.5">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="profile-email"
                    value={profile.email}
                    readOnly={true}
                    className="field-input cursor-not-allowed bg-muted/45 pl-9 text-muted-foreground"
                  />
                </div>
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  {t('emailReadOnly')}
                </p>
              </div>
              {profileError && (
                <p
                  id="profile-error"
                  role="alert"
                  className="text-xs text-destructive"
                >
                  {profileError}
                </p>
              )}
              <Button
                type="submit"
                disabled={busy !== null || name.trim() === (profile.name ?? '')}
                variant="default"
                className="disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy === 'profile' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {t('saveProfile')}
              </Button>
            </form>
          </Card>

          <Card
            as="section"
            className="block gap-0 py-0 p-5 sm:p-6"
            aria-labelledby="security-title"
          >
            <div className="flex items-start gap-3">
              <div className="icon-tile">
                <KeyRound className="h-4 w-4" />
              </div>
              <div>
                <h2
                  id="security-title"
                  className="scroll-mt-24 text-base font-semibold"
                >
                  {t('securityTitle')}
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t('securityDesc')}
                </p>
              </div>
            </div>

            {credentialAccount ? (
              <form
                className="mt-5 grid gap-4 sm:grid-cols-2"
                onSubmit={changePassword}
              >
                <div className="sm:col-span-2">
                  <Label htmlFor="current-password" className="field-label">
                    {t('currentPassword')}
                  </Label>
                  <Input
                    id="current-password"
                    type="password"
                    value={currentPassword}
                    onChange={(event) => setCurrentPassword(event.target.value)}
                    autoComplete="current-password"
                    required={true}
                    disabled={busy !== null}
                    className="field-input mt-1.5"
                  />
                </div>
                <div>
                  <Label htmlFor="new-password" className="field-label">
                    {t('newPassword')}
                  </Label>
                  <Input
                    id="new-password"
                    type="password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    autoComplete="new-password"
                    minLength={12}
                    required={true}
                    disabled={busy !== null}
                    className="field-input mt-1.5"
                  />
                </div>
                <div>
                  <Label htmlFor="confirm-password" className="field-label">
                    {t('confirmPassword')}
                  </Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    autoComplete="new-password"
                    minLength={12}
                    required={true}
                    disabled={busy !== null}
                    className="field-input mt-1.5"
                  />
                </div>
                <p className="text-[11px] leading-relaxed text-muted-foreground sm:col-span-2">
                  {t('passwordHint')}
                </p>
                {passwordError && (
                  <p
                    role="alert"
                    className="text-xs text-destructive sm:col-span-2"
                  >
                    {passwordError}
                  </p>
                )}
                <div className="sm:col-span-2">
                  <Button
                    type="submit"
                    disabled={busy !== null}
                    variant="outline"
                    className="disabled:opacity-50"
                  >
                    {busy === 'password' ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <LockKeyhole className="h-4 w-4" />
                    )}
                    {t('changePassword')}
                  </Button>
                </div>
              </form>
            ) : (
              <div className="mt-5 flex items-start gap-3 rounded-xl border border-border bg-muted/35 p-4">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {t('providerPassword', { provider: profile.provider })}
                </p>
              </div>
            )}
          </Card>

          <Card
            as="section"
            className="block gap-0 py-0 p-5 sm:p-6"
            aria-labelledby="privacy-title"
          >
            <div className="flex items-start gap-3">
              <div className="icon-tile">
                <Shield className="h-4 w-4" />
              </div>
              <div>
                <h2
                  id="privacy-title"
                  className="scroll-mt-24 text-base font-semibold"
                >
                  {t('dataPrivacy')}
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t('dataPrivacyDesc')}
                </p>
              </div>
            </div>
            <p className="mt-4 text-[13px] text-muted-foreground">
              {t('readPrivacy')}{' '}
              <Link href="/privacy" className="text-primary hover:underline">
                {t('privacyPolicy')}
              </Link>{' '}
              {t('and')}{' '}
              <Link href="/terms" className="text-primary hover:underline">
                {t('termsOfService')}
              </Link>
              .
            </p>
            <Button
              type="button"
              onClick={() => void exportData()}
              disabled={busy !== null}
              variant="outline"
              className="mt-4 disabled:opacity-50"
            >
              {busy === 'export' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              {t('exportData')}
            </Button>
          </Card>

          <section
            className="rounded-2xl border border-destructive/25 bg-destructive/[0.035] p-5 sm:p-6"
            aria-labelledby="danger-title"
          >
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 text-destructive" />
              <div>
                <h2
                  id="danger-title"
                  className="font-semibold text-destructive"
                >
                  {t('dangerZone')}
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t('dangerZoneDesc')}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={openDeleteDialog}
              disabled={busy !== null}
              className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-2 text-[13px] font-semibold text-destructive transition-colors hover:bg-destructive/20 disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" />
              {t('deleteAccount')}
            </button>
          </section>
        </div>

        <aside className="space-y-5 xl:sticky xl:top-6 xl:self-start">
          <Card
            as="section"
            className="block gap-0 py-0 p-5"
            aria-labelledby="account-title"
          >
            <div className="flex items-center gap-3">
              <div className="icon-tile">
                <User className="h-4 w-4" />
              </div>
              <h2 id="account-title" className="text-sm font-semibold">
                {t('accountDetails')}
              </h2>
            </div>
            <dl className="mt-5 space-y-4 text-sm">
              <div>
                <dt className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  {t('memberSince')}
                </dt>
                <dd className="mt-1 flex items-center gap-2 font-medium">
                  <CalendarDays className="h-3.5 w-3.5 text-primary" />
                  {joinedDate}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  {t('emailStatus')}
                </dt>
                <dd className="mt-1 font-medium">
                  {profile.emailVerified ? t('verified') : t('notVerified')}
                </dd>
              </div>
            </dl>
            <Button asChild={true} variant="outline">
              <Link href="/dashboard/billing" className="mt-5 w-full">
                {t('manageSubscription')}
              </Link>
            </Button>
          </Card>

          <Card
            as="section"
            className="block gap-0 py-0 p-5"
            aria-labelledby="preferences-title"
          >
            <div className="flex items-center gap-3">
              <div className="icon-tile">
                <Globe className="h-4 w-4" />
              </div>
              <h2
                id="preferences-title"
                className="scroll-mt-24 text-sm font-semibold"
              >
                {t('preferences')}
              </h2>
            </div>
            <div className="mt-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
                <span className="text-[13px]">{t('language')}</span>
                <LanguageSwitcher />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-[13px]">{t('theme')}</span>
                <ThemeToggle />
              </div>
            </div>
          </Card>
        </aside>
      </div>

      <dialog
        ref={deleteDialog}
        aria-labelledby="delete-dialog-title"
        aria-describedby="delete-dialog-description"
        onClose={() => {
          setDeleteConfirmation('')
          setDeletePassword('')
          setDeleteError(null)
          if (busy === 'delete') setBusy(null)
        }}
        className="m-auto w-[min(32rem,calc(100%-2rem))] rounded-2xl border border-destructive/25 bg-card p-0 text-card-foreground shadow-2xl backdrop:bg-black/65"
      >
        <form className="p-6" onSubmit={deleteAccount}>
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <h2 id="delete-dialog-title" className="mt-4 text-lg font-semibold">
            {t('deleteDialogTitle')}
          </h2>
          <p
            id="delete-dialog-description"
            className="mt-2 text-sm leading-relaxed text-muted-foreground"
          >
            {t('deleteDialogDesc')}
          </p>
          <Label
            htmlFor="delete-confirmation"
            className="field-label mt-5 block"
          >
            {t('deleteConfirmationLabel', { email: profile.email })}
          </Label>
          <Input
            id="delete-confirmation"
            value={deleteConfirmation}
            onChange={(event) => setDeleteConfirmation(event.target.value)}
            autoComplete="off"
            spellCheck={false}
            disabled={busy === 'delete'}
            className="field-input mt-1.5"
            aria-describedby={deleteError ? 'delete-error' : undefined}
          />
          {credentialAccount ? (
            <div className="mt-4">
              <Label htmlFor="delete-password" className="field-label block">
                {t('deletePasswordLabel')}
              </Label>
              <Input
                id="delete-password"
                type="password"
                value={deletePassword}
                onChange={(event) => setDeletePassword(event.target.value)}
                autoComplete="current-password"
                maxLength={128}
                required={true}
                disabled={busy === 'delete'}
                className="field-input mt-1.5"
                aria-describedby={deleteError ? 'delete-error' : undefined}
              />
            </div>
          ) : !profile.recentlyAuthenticated ? (
            <div className="mt-4 rounded-xl border border-warning/25 bg-warning/10 p-4">
              <p className="text-xs leading-relaxed text-foreground">
                {t('reauthenticationRequired', { provider: profile.provider })}
              </p>
              <Button
                type="button"
                onClick={() => void reauthenticateForDeletion()}
                disabled={busy !== null}
                variant="outline"
                className="mt-3"
              >
                {busy === 'reauthenticate' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Shield className="h-4 w-4" />
                )}
                {t('reauthenticate')}
              </Button>
            </div>
          ) : null}
          {deleteError && (
            <p
              id="delete-error"
              role="alert"
              className="mt-2 text-xs text-destructive"
            >
              {deleteError}
            </p>
          )}
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              onClick={() => deleteDialog.current?.close()}
              disabled={busy === 'delete'}
              variant="outline"
              className=""
            >
              {t('cancel')}
            </Button>
            <button
              type="submit"
              disabled={
                busy === 'delete' ||
                (credentialAccount
                  ? deletePassword.length === 0
                  : !profile.recentlyAuthenticated) ||
                deleteConfirmation.trim().toLowerCase() !==
                  profile.email.toLowerCase()
              }
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-destructive px-4 py-2 text-[13px] font-semibold text-destructive-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {busy === 'delete' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              {t('deletePermanently')}
            </button>
          </div>
        </form>
      </dialog>
    </div>
  )
}
