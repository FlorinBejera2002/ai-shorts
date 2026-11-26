'use client'

import { pickInlineText } from '@/i18n/inline-text'
import { AuthCanvasLayout } from '@/components/auth/auth-canvas-layout'
import { AuthCanvasTabs } from '@/components/auth/auth-canvas-tabs'
import {
  AuthAccountPrompt,
  AuthForm,
  AuthHeading
} from '@/components/auth/auth-card-parts'
import { CanvasButton } from '@/components/auth/canvas-button'
import { CanvasField } from '@/components/auth/canvas-field'
import { PasswordInput } from '@/components/auth/password-input'
import { PasswordRules } from '@/components/auth/password-rules'
import {
  passwordRuleChecks,
  usePasswordRuleLabels
} from '@/components/auth/password-policy'
import styles from '@/components/auth/auth-canvas.module.css'
import { LoadingIndicator } from '@/components/ui/loading-indicator'
import { useToast } from '@/components/ui/toast'
import { Link, useRouter } from '@/i18n/navigation'
import { publicApiFetch } from '@/lib/auth'
import { useLocale, useTranslations } from 'next-intl'
import { useState } from 'react'

export default function RegisterPage() {
  const t = useTranslations('auth')
  const tc = useTranslations('authCanvas')
  const locale = useLocale()
  const router = useRouter()
  const toast = useToast()
  const ruleLabels = usePasswordRuleLabels()
  const [busy, setBusy] = useState(false)
  const [password, setPassword] = useState('')
  const [verificationEmail, setVerificationEmail] = useState<string | null>(
    null
  )

  const checks = passwordRuleChecks(password, ruleLabels)
  const allPass = checks.every((check) => check.passed)

  async function submit(formData: FormData) {
    if (!allPass) {
      toast.add('error', t('passwordWeak'))
      return
    }
    setBusy(true)
    try {
      const res = await publicApiFetch('/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.get('name'),
          email: formData.get('email'),
          password: formData.get('password')
        })
      })
      const data = await res.json()
      if (!res.ok) {
        toast.add('error', data.error ?? t('errorGeneric'))
        setBusy(false)
        return
      }
      setPassword('')
      if (data.verificationRequired) {
        setVerificationEmail(String(formData.get('email') ?? ''))
        setBusy(false)
        return
      }
      toast.add('success', t('accountCreated'))
      router.replace('/login?registered=true')
    } catch {
      toast.add('error', t('errorGeneric'))
      setBusy(false)
    }
  }

  async function resend() {
    setBusy(true)
    try {
      const response = await publicApiFetch('/v1/auth/resend-activation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: verificationEmail })
      })
      if (!response.ok) throw new Error('Delivery failed')
      toast.add(
        'success',
        pickInlineText(
          locale,
          'Check your email for an activation link.',
          'Verifică mesajele primite.',
          'Revisa tu correo para ver el enlace de activación.'
        )
      )
    } catch {
      toast.add('error', t('errorGeneric'))
    } finally {
      setBusy(false)
    }
  }

  if (verificationEmail) {
    return (
      <AuthCanvasLayout screen="verify">
        <AuthHeading
          centered={true}
          title={tc('verify.title')}
          description={tc('verify.description', { email: verificationEmail })}
        />
        <CanvasButton href="/login">{t('signIn')}</CanvasButton>
        <CanvasButton
          variant="secondary"
          disabled={busy}
          onClick={() => void resend()}
        >
          {tc('verify.resend')}
        </CanvasButton>
        <AuthAccountPrompt kind="noAccount" />
      </AuthCanvasLayout>
    )
  }

  return (
    <AuthCanvasLayout screen="register" compact={true}>
      <AuthCanvasTabs active="register" />
      <AuthForm action={(formData) => void submit(formData)}>
        <CanvasField
          id="name"
          name="name"
          required={true}
          label={t('name')}
          placeholder={pickInlineText(locale, 'John Doe', 'Ion Popescu', 'Juan Pérez')}
          autoComplete="name"
        />
        <CanvasField
          id="reg-email"
          name="email"
          type="email"
          required={true}
          label={t('email')}
          placeholder="name@example.com"
          autoComplete="email"
        />
        <PasswordInput
          id="reg-password"
          name="password"
          required={true}
          label={t('password')}
          placeholder="••••••••••••"
          autoComplete="new-password"
          showLabel={t('showPassword')}
          hideLabel={t('hidePassword')}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <PasswordRules checks={checks} />
        <CanvasButton type="submit" disabled={busy || !allPass}>
          {busy && <LoadingIndicator className="size-4" />}
          {busy ? t('creating') : t('createAccount')}
        </CanvasButton>
        <p className={styles.legal}>
          {tc('terms.prefix')}{' '}
          <Link href="/terms">{tc('terms.terms')}</Link> {tc('terms.and')}{' '}
          <Link href="/privacy">{tc('terms.privacy')}</Link>.
        </p>
      </AuthForm>
      <AuthAccountPrompt kind="hasAccount" />
    </AuthCanvasLayout>
  )
}
