'use client'

import { AuthCanvasLayout } from '@/components/auth/auth-canvas-layout'
import {
  AuthAccountPrompt,
  AuthForm,
  AuthHeading
} from '@/components/auth/auth-card-parts'
import { CanvasButton } from '@/components/auth/canvas-button'
import { PasswordInput } from '@/components/auth/password-input'
import { PasswordRules } from '@/components/auth/password-rules'
import {
  passwordRuleChecks,
  usePasswordRuleLabels
} from '@/components/auth/password-policy'
import { ApiState } from '@/components/shared/api-state'
import { LoadingIndicator } from '@/components/ui/loading-indicator'
import { useToast } from '@/components/ui/toast'
import { publicApiFetch } from '@/lib/auth'
import { useTranslations } from 'next-intl'
import { useSearchParams } from 'next/navigation'
import { Suspense, useState } from 'react'

const SPECIAL_CHARACTER = /[^A-Za-z0-9]/

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<ApiState />}>
      <ResetPasswordContent />
    </Suspense>
  )
}

function ResetPasswordContent() {
  const t = useTranslations('auth')
  const tc = useTranslations('authCanvas')
  const toast = useToast()
  const token = useSearchParams().get('token') ?? ''
  const ruleLabels = usePasswordRuleLabels()

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  const match = password.length > 0 && password === confirm
  const checks = [
    ...passwordRuleChecks(password, ruleLabels, SPECIAL_CHARACTER),
    { id: 'match', label: t('passwordsMatch'), passed: match }
  ]
  const canSubmit = checks.every((check) => check.passed)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setBusy(true)
    try {
      const res = await publicApiFetch('/v1/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, password }),
        headers: { 'Content-Type': 'application/json' }
      })
      if (!res.ok) {
        const data = await res.json()
        toast.add('error', data.error ?? 'Failed to reset password')
        return
      }
      setDone(true)
    } catch {
      toast.add('error', 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  if (!token) {
    return (
      <AuthCanvasLayout screen="resetInvalid">
        <AuthHeading
          centered={true}
          title={tc('resetInvalid.title')}
          description={tc('resetInvalid.description')}
        />
        <CanvasButton href="/forgot-password">
          {tc('resetInvalid.submit')}
        </CanvasButton>
        <AuthAccountPrompt kind="noAccount" />
      </AuthCanvasLayout>
    )
  }

  if (done) {
    return (
      <AuthCanvasLayout screen="resetDone">
        <AuthHeading
          centered={true}
          title={tc('resetDone.title')}
          description={tc('resetDone.description')}
        />
        <CanvasButton href="/login">{t('signIn')}</CanvasButton>
        <AuthAccountPrompt kind="noAccount" />
      </AuthCanvasLayout>
    )
  }

  return (
    <AuthCanvasLayout screen="reset">
      <AuthHeading title={t('resetTitle')} />
      <AuthForm onSubmit={(e) => void submit(e)}>
        <PasswordInput
          id="password"
          label={tc('reset.newPassword')}
          placeholder="••••••••••••"
          autoComplete="new-password"
          required={true}
          showLabel={t('showPassword')}
          hideLabel={t('hidePassword')}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <PasswordInput
          id="confirm"
          label={tc('reset.confirmPassword')}
          placeholder="••••••••••••"
          autoComplete="new-password"
          required={true}
          showLabel={t('showPassword')}
          hideLabel={t('hidePassword')}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
        <PasswordRules checks={checks} />
        <CanvasButton type="submit" disabled={busy || !canSubmit}>
          {busy && <LoadingIndicator className="size-4" />}
          {busy ? t('signingIn') : t('resetButton')}
        </CanvasButton>
      </AuthForm>
      <AuthAccountPrompt kind="noAccount" />
    </AuthCanvasLayout>
  )
}
