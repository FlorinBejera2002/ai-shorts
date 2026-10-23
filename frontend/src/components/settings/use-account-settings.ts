'use client'

import { useToast } from '@/components/ui/toast'
import { useRouter } from '@/i18n/navigation'
import {
  normalizeDisplayName,
  validatePasswordPayload,
  validateAccountDeletionPayload
} from '@/lib/account-settings'
import { apiFetch, authClient, googleSignIn, publicApiFetch } from '@/lib/auth'
import { useQueryClient } from '@tanstack/react-query'
import { useLocale, useTranslations } from 'next-intl'
import { type FormEvent, useRef, useState } from 'react'
import type { Profile } from './settings-types'

type Action =
  | 'profile'
  | 'password'
  | 'verification'
  | 'export'
  | 'delete'
  | 'reauthenticate'

class SettingsRequestError extends Error {
  readonly code?: string
  constructor(message: string, code?: string) {
    super(message)
    this.code = code
  }
}

async function requireSuccess(response: Response, fallback: string) {
  if (response.ok) return response
  const data = await response.json().catch(() => null)
  const issue = Array.isArray(data?.issues)
    ? data.issues.find(
        (item: { message?: string }) => typeof item?.message === 'string'
      )
    : null
  throw new SettingsRequestError(
    issue?.message || (typeof data?.error === 'string' ? data.error : fallback),
    typeof data?.code === 'string' ? data.code : undefined
  )
}

export function useAccountSettings(
  initialProfile: Profile,
  externalBusy: boolean,
  acquireMutation: () => boolean,
  releaseMutation: () => void
) {
  const t = useTranslations('settings')
  const locale = useLocale()
  const router = useRouter()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [profile, setProfile] = useState(initialProfile)
  const [name, setName] = useState(initialProfile.name ?? '')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [deleteConfirmation, setDeleteConfirmation] = useState('')
  const [deletePassword, setDeletePassword] = useState('')
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [busy, setBusy] = useState<Action | null>(null)
  const busyRef = useRef(false)
  const [errors, setErrors] = useState<Partial<Record<Action, string>>>({})
  const [verificationSent, setVerificationSent] = useState(false)
  const [exported, setExported] = useState(false)
  const blocked = externalBusy || busy !== null
  const normalizedName = normalizeDisplayName(name)
  const profileValid = normalizedName.length >= 2 && normalizedName.length <= 80
  const deletionPayload = profile.canChangePassword
    ? { confirmation: deleteConfirmation, currentPassword: deletePassword }
    : { confirmation: deleteConfirmation }
  const deletionValid =
    validateAccountDeletionPayload(
      deletionPayload,
      profile.email,
      profile.canChangePassword
    ).success &&
    (profile.canChangePassword || profile.recentlyAuthenticated)

  async function run(
    action: Action,
    fallback: string,
    operation: () => Promise<void>,
    keepBusyOnSuccess = false
  ) {
    if (busyRef.current || externalBusy || !acquireMutation()) return
    busyRef.current = true
    setBusy(action)
    setErrors((current) => ({ ...current, [action]: undefined }))
    let succeeded = false
    try {
      await operation()
      succeeded = true
    } catch (error) {
      if (
        action === 'delete' &&
        error instanceof SettingsRequestError &&
        error.code === 'reauthentication_required'
      ) {
        setProfile((current) => ({ ...current, recentlyAuthenticated: false }))
      }
      setErrors((current) => ({
        ...current,
        [action]: error instanceof Error ? error.message : fallback
      }))
    } finally {
      if (!keepBusyOnSuccess || !succeeded) {
        busyRef.current = false
        releaseMutation()
        setBusy(null)
      }
    }
  }

  function saveProfile(event: FormEvent) {
    event.preventDefault()
    if (!profileValid || normalizedName === profile.name) return
    void run('profile', t('profileSaveFailed'), async () => {
      const response = await requireSuccess(
        await apiFetch('/api/user/profile', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: normalizedName })
        }),
        t('profileSaveFailed')
      )
      const data = await response.json()
      setProfile((current) => ({ ...current, ...data.profile }))
      setName(data.profile.name ?? '')
      toast.add('success', t('profileSaved'))
      router.refresh()
    })
  }

  function changePassword(event: FormEvent) {
    event.preventDefault()
    const payload = { currentPassword, newPassword, confirmPassword }
    const validation = validatePasswordPayload(payload)
    if (!validation.success) {
      setErrors((current) => ({
        ...current,
        password: t('workspaceDesign.passwordInvalid')
      }))
      return
    }
    void run('password', t('passwordFailed'), async () => {
      await requireSuccess(
        await apiFetch('/api/user/password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }),
        t('passwordFailed')
      )
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      toast.add('success', t('passwordChanged'))
      await authClient.logout()
      router.push('/login')
      router.refresh()
    })
  }

  function resendVerification() {
    if (profile.emailVerified) return
    setVerificationSent(false)
    void run('verification', t('verificationSendFailed'), async () => {
      await requireSuccess(
        await publicApiFetch('/v1/auth/resend-activation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: profile.email })
        }),
        t('verificationSendFailed')
      )
      setVerificationSent(true)
    })
  }

  function exportData() {
    setExported(false)
    void run('export', t('exportFailed'), async () => {
      const response = await requireSuccess(
        await apiFetch('/api/user/data', { cache: 'no-store' }),
        t('exportFailed')
      )
      const data = await response.json()
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      )
      const anchor = document.createElement('a')
      try {
        anchor.href = url
        anchor.download = `sneepcut-data-export-${new Date().toISOString().slice(0, 10)}.json`
        document.body.append(anchor)
        anchor.click()
      } finally {
        anchor.remove()
        URL.revokeObjectURL(url)
      }
      setExported(true)
      void queryClient.invalidateQueries({
        queryKey: ['api-resource', '/api/user/settings']
      })
    })
  }

  function onDeleteOpenChange(open: boolean) {
    if (busyRef.current || externalBusy) return
    setDeleteOpen(open)
    if (!open) {
      setDeleteConfirmation('')
      setDeletePassword('')
      setErrors((current) => ({
        ...current,
        delete: undefined,
        reauthenticate: undefined
      }))
    }
  }

  function reauthenticate() {
    void run(
      'reauthenticate',
      t('reauthenticationFailed'),
      async () => {
        googleSignIn(`${window.location.pathname}#privacy-title`, locale)
      },
      true
    )
  }

  function deleteAccount(event: FormEvent) {
    event.preventDefault()
    if (!deletionValid) return
    void run('delete', t('deleteFailed'), async () => {
      await requireSuccess(
        await apiFetch('/api/user/data', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(deletionPayload)
        }),
        t('deleteFailed')
      )
      setDeleteOpen(false)
      setDeletePassword('')
      toast.add('success', t('deleteSuccess'))
      await authClient.logout()
      router.push('/login')
      router.refresh()
    })
  }

  return {
    profile,
    name,
    setName,
    normalizedName,
    profileValid,
    currentPassword,
    setCurrentPassword,
    newPassword,
    setNewPassword,
    confirmPassword,
    setConfirmPassword,
    busy,
    blocked,
    errors,
    saveProfile,
    changePassword,
    resendVerification,
    verificationSent,
    exportData,
    exported,
    deleteOpen,
    onDeleteOpenChange,
    deleteConfirmation,
    setDeleteConfirmation,
    deletePassword,
    setDeletePassword,
    deletionValid,
    reauthenticate,
    deleteAccount
  }
}

export type AccountSettingsController = ReturnType<typeof useAccountSettings>
