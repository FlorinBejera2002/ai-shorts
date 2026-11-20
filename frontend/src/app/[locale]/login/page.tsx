'use client'

import { AuthCanvasLayout } from '@/components/auth/auth-canvas-layout'
import { AuthCanvasTabs } from '@/components/auth/auth-canvas-tabs'
import {
  AuthAccountPrompt,
  AuthDivider,
  AuthForm,
  AuthHeading
} from '@/components/auth/auth-card-parts'
import { CanvasButton } from '@/components/auth/canvas-button'
import { CanvasField } from '@/components/auth/canvas-field'
import styles from '@/components/auth/auth-canvas.module.css'
import { GoogleMark } from '@/components/auth/google-mark'
import { PasswordInput } from '@/components/auth/password-input'
import { SecondFactorForm } from '@/components/auth/second-factor-form'
import { SubmitButton } from '@/components/auth/submit-button'
import { ApiState } from '@/components/shared/api-state'
import { useToast } from '@/components/ui/toast'
import { Link, usePathname, useRouter } from '@/i18n/navigation'
import { authClient, googleSignIn, safeReturnPath } from '@/lib/auth'
import { ApiError } from '@/lib/auth-client'
import { useLocale, useTranslations } from 'next-intl'
import { useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useState } from 'react'

interface PendingLogin {
  email: string
  password: string
}

type LoginErrorKey =
  | 'errorInvalidCredentials'
  | 'errorAccountExists'
  | 'errorDatabase'
  | 'errorGeneric'

/** Copy key for an error code reported by a sign-in attempt or an OAuth return. */
function loginErrorKey(code: string): LoginErrorKey {
  if (code === 'CredentialsSignin') return 'errorInvalidCredentials'
  if (code === 'account_exists') return 'errorAccountExists'
  if (code === 'CallbackRouteError') return 'errorDatabase'
  return 'errorGeneric'
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
  const addToast = useToast((state) => state.add)
  const search = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const redirectErrorCode = search.get('error')
  // Set once the password was accepted but the account requires a second factor.
  const [pendingLogin, setPendingLogin] = useState<PendingLogin | null>(null)
  // A wrong second-factor code stays beside its field so the user can retry.
  const [codeError, setCodeError] = useState<string | null>(null)
  const prefix = locale === 'en' ? '' : `/${locale}`
  const redirectTo = safeReturnPath(
    search.get('callbackUrl'),
    `${prefix}/dashboard`
  )

  // A failed OAuth return is announced once; the code then leaves the URL so a reload does not repeat it.
  useEffect(() => {
    if (!redirectErrorCode) return
    addToast('error', t(loginErrorKey(redirectErrorCode)))
    const params = new URLSearchParams(window.location.search)
    params.delete('error')
    const query = params.toString()
    router.replace(query ? `${pathname}?${query}` : pathname)
  }, [redirectErrorCode, pathname, router, t, addToast])

  async function attemptLogin(
    credentials: PendingLogin,
    secondFactor: string | null
  ) {
    setCodeError(null)
    try {
      await authClient.login(
        credentials.email,
        credentials.password,
        secondFactor ?? ''
      )
      window.location.assign(redirectTo)
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === 'mfa_required') {
        setPendingLogin(credentials)
      } else if (secondFactor === null) {
        addToast('error', t('errorInvalidCredentials'))
      } else {
        setCodeError(t('errorInvalidCredentials'))
      }
    }
  }

  async function submitCredentials(formData: FormData) {
    await attemptLogin(
      {
        email: String(formData.get('email') ?? ''),
        password: String(formData.get('password') ?? '')
      },
      null
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
          errorMessage={codeError}
          onSubmit={submitSecondFactor}
          onBack={() => {
            setPendingLogin(null)
            setCodeError(null)
          }}
        />
      </AuthCanvasLayout>
    )
  }

  return (
    <AuthCanvasLayout screen="login">
      <AuthCanvasTabs active="login" />
      <AuthHeading title={t('welcomeBack')} />
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
