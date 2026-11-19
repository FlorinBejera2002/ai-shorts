'use client'

import { AuthCanvasLayout } from '@/components/auth/auth-canvas-layout'
import { AuthCanvasTabs } from '@/components/auth/auth-canvas-tabs'
import {
  AuthAccountPrompt,
  AuthDivider,
  AuthForm,
  AuthHeading,
  AuthNotice
} from '@/components/auth/auth-card-parts'
import { CanvasButton } from '@/components/auth/canvas-button'
import { CanvasField } from '@/components/auth/canvas-field'
import styles from '@/components/auth/auth-canvas.module.css'
import { GoogleMark } from '@/components/auth/google-mark'
import { PasswordInput } from '@/components/auth/password-input'
import { SecondFactorForm } from '@/components/auth/second-factor-form'
import { SubmitButton } from '@/components/auth/submit-button'
import { ApiState } from '@/components/shared/api-state'
import { Link } from '@/i18n/navigation'
import { authClient, googleSignIn, safeReturnPath } from '@/lib/auth'
import { ApiError } from '@/lib/auth-client'
import { useLocale, useTranslations } from 'next-intl'
import { useSearchParams } from 'next/navigation'
import { Suspense, useState } from 'react'

interface PendingLogin {
  email: string
  password: string
}

export default function LoginPage() {
  return (
    <Suspense fallback={<ApiState />}>
      <LoginForm />
    </Suspense>
  )
}

function LoginForm() {
  const locale = useLocale()
  const t = useTranslations('auth')
  const search = useSearchParams()
  const [error, setError] = useState(() => search.get('error'))
  // Set once the password was accepted but the account requires a second factor.
  const [pendingLogin, setPendingLogin] = useState<PendingLogin | null>(null)
  const prefix = locale === 'en' ? '' : `/${locale}`
  const redirectTo = safeReturnPath(
    search.get('callbackUrl'),
    `${prefix}/dashboard`
  )
  const errorMessage = error ? describeLoginError(error) : null

  function describeLoginError(code: string) {
    if (code === 'CredentialsSignin') return t('errorInvalidCredentials')
    if (code === 'account_exists') return t('errorAccountExists')
    if (code === 'CallbackRouteError') return t('errorDatabase')
    return t('errorGeneric')
  }

  async function attemptLogin(credentials: PendingLogin, secondFactor: string) {
    setError(null)
    try {
      await authClient.login(
        credentials.email,
        credentials.password,
        secondFactor
      )
      window.location.assign(redirectTo)
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === 'mfa_required') {
        setPendingLogin(credentials)
        setError(null)
      } else {
        setError('CredentialsSignin')
      }
    }
  }

  async function submitCredentials(formData: FormData) {
    await attemptLogin(
      {
        email: String(formData.get('email') ?? ''),
        password: String(formData.get('password') ?? '')
      },
      ''
    )
  }

  async function submitSecondFactor(formData: FormData) {
    if (!pendingLogin) return
    await attemptLogin(
      pendingLogin,
      String(formData.get('secondFactor') ?? '')
    )
  }

  if (pendingLogin) {
    return (
      <AuthCanvasLayout screen="mfa">
        <SecondFactorForm
          errorMessage={errorMessage}
          onSubmit={submitSecondFactor}
          onBack={() => {
            setPendingLogin(null)
            setError(null)
          }}
        />
      </AuthCanvasLayout>
    )
  }

  return (
    <AuthCanvasLayout screen="login">
      <AuthCanvasTabs active="login" />
      <AuthHeading title={t('welcomeBack')} />
      {search.get('registered') === 'true' && (
        <AuthNotice tone="success">{t('accountCreated')}</AuthNotice>
      )}
      {errorMessage && <AuthNotice tone="error">{errorMessage}</AuthNotice>}
      <form action={() => googleSignIn(redirectTo, locale)}>
        <CanvasButton type="submit" variant="secondary">
          <GoogleMark />
          {t('continueGoogle')}
        </CanvasButton>
      </form>
      <AuthDivider label={t('or')} />
      <AuthForm action={submitCredentials}>
        <CanvasField
          id="email"
          name="email"
          type="email"
          required={true}
          label={t('email')}
          placeholder="name@example.com"
          autoComplete="email"
        />
        <PasswordInput
          id="password"
          name="password"
          required={true}
          label={t('password')}
          labelAction={
            <Link href="/forgot-password" className={styles.labelAction}>
              {t('forgotPassword')}
            </Link>
          }
          autoComplete="current-password"
          showLabel={t('showPassword')}
          hideLabel={t('hidePassword')}
        />
        <SubmitButton label={t('signIn')} pendingLabel={t('signingIn')} />
      </AuthForm>
      <AuthAccountPrompt kind="noAccount" />
    </AuthCanvasLayout>
  )
}
