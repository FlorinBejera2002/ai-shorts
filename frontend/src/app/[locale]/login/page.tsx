'use client'

import { AuthPanel } from '@/components/auth/auth-panel'
import { PasswordInput } from '@/components/auth/password-input'
import { SubmitButton } from '@/components/auth/submit-button'
import { ApiState } from '@/components/shared/api-state'
import { ThemeBrandLogo } from '@/components/shared/brand-logo'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Link } from '@/i18n/navigation'
import { authClient, googleSignIn, safeReturnPath } from '@/lib/auth'
import { ApiError } from '@/lib/auth-client'
import { useLocale, useTranslations } from 'next-intl'
import { useSearchParams } from 'next/navigation'
import { Suspense, useState } from 'react'

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
  const [requiresSecondFactor, setRequiresSecondFactor] = useState(false)
  const prefix = locale === 'en' ? '' : `/${locale}`
  const redirectTo = safeReturnPath(
    search.get('callbackUrl'),
    `${prefix}/dashboard`
  )
  async function submit(formData: FormData) {
    setError(null)
    try {
      await authClient.login(
        String(formData.get('email') ?? ''),
        String(formData.get('password') ?? ''),
        String(formData.get('secondFactor') ?? '')
      )
      window.location.assign(redirectTo)
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === 'mfa_required') {
        setRequiresSecondFactor(true)
        setError(null)
      } else {
        setError('CredentialsSignin')
      }
    }
  }

  return (
    <main className="flex min-h-dvh bg-background text-foreground">
      <AuthPanel title={t('heroTitle')} desc={t('heroDesc')}>
        <div className="flex items-center gap-6 pt-2">
          <div>
            <div className="text-2xl font-bold text-white">5 min</div>
            <div className="text-[11px] text-white/50 uppercase tracking-wider mt-0.5">
              {t('panelProcessing')}
            </div>
          </div>
          <div className="w-px h-10 bg-white/20" />
          <div>
            <div className="text-2xl font-bold text-white">AI</div>
            <div className="text-[11px] text-white/50 uppercase tracking-wider mt-0.5">
              {t('panelPowered')}
            </div>
          </div>
          <div className="w-px h-10 bg-white/20" />
          <div>
            <div className="text-2xl font-bold text-white">9:16</div>
            <div className="text-[11px] text-white/50 uppercase tracking-wider mt-0.5">
              {t('panelAutoCrop')}
            </div>
          </div>
        </div>
      </AuthPanel>

      {/* Right — form */}
      <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-background p-5 sm:p-8">
        <div className="hidden" />
        <Card className="relative block w-full max-w-md gap-0 rounded-2xl border bg-card p-6 shadow-sm sm:p-9">
          {/* Mobile logo */}
          <Link href="/" className="mb-9 flex items-center gap-2 lg:hidden">
            <ThemeBrandLogo />
          </Link>

          <h1 className="text-3xl font-semibold leading-tight tracking-tight text-foreground">
            {t('welcomeBack')}
          </h1>
          <p className="mt-3  text-sm leading-6 text-muted-foreground">
            {t('signInDesc')}
          </p>

          {search.get('registered') === 'true' && (
            <p role="status" className="mt-5 text-sm text-success">
              {t('accountCreated')}
            </p>
          )}
          {error && (
            <div
              role="alert"
              className="mt-5 animate-slide-down flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-[13px] text-red-400"
            >
              <svg
                aria-hidden="true"
                className="w-4 h-4 shrink-0"
                viewBox="0 0 16 16"
                fill="currentColor"
              >
                <circle cx="8" cy="8" r="8" opacity="0.15" />
                <path d="M8 4a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 018 4zm0 7a.75.75 0 100-1.5.75.75 0 000 1.5z" />
              </svg>
              {error === 'CredentialsSignin'
                ? t('errorInvalidCredentials')
                : error === 'account_exists'
                  ? t('errorAccountExists')
                  : error === 'CallbackRouteError'
                    ? t('errorDatabase')
                    : t('errorGeneric')}
            </div>
          )}

          {/* Google */}
          <form
            action={() => googleSignIn(redirectTo, locale)}
            className="mt-7"
          >
            <Button
              type="submit"
              className="h-11 w-full border border-input bg-background text-foreground hover:bg-muted"
            >
              <svg
                aria-hidden="true"
                className="w-[18px] h-[18px]"
                viewBox="0 0 24 24"
              >
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
              {t('continueGoogle')}
            </Button>
          </form>

          {/* Divider */}
          <div className="relative my-7">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-background px-4  text-sm uppercase tracking-[0.2em] text-muted-foreground">
                {t('or')}
              </span>
            </div>
          </div>

          {/* Credentials */}
          <form action={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label
                htmlFor="email"
                className="text-sm font-medium text-foreground"
              >
                {t('email')}
              </Label>
              <Input
                id="email"
                name="email"
                type="email"
                required={true}
                placeholder="name@example.com"
                autoComplete="email"
                className="h-11 rounded-lg bg-background"
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label
                  htmlFor="password"
                  className="text-sm font-medium text-foreground"
                >
                  {t('password')}
                </Label>
                <Link
                  href="/forgot-password"
                  className=" text-sm text-primary transition-colors hover:text-primary"
                >
                  {t('forgotPassword')}
                </Link>
              </div>
              <PasswordInput
                id="password"
                name="password"
                autoComplete="current-password"
                showLabel={t('showPassword')}
                hideLabel={t('hidePassword')}
              />
            </div>
            {requiresSecondFactor && (
              <div className="space-y-1.5">
                <Label htmlFor="second-factor" className="text-sm font-medium">
                  {t('secondFactor')}
                </Label>
                <Input
                  id="second-factor"
                  name="secondFactor"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={19}
                  required={true}
                  autoFocus={true}
                  placeholder={t('secondFactorPlaceholder')}
                />
                <p className="text-xs text-muted-foreground">
                  {t('secondFactorHint')}
                </p>
              </div>
            )}
            <SubmitButton label={t('signIn')} pendingLabel={t('signingIn')} />
          </form>

          <p className="mt-7 text-center  text-sm text-muted-foreground">
            {t('noAccount')}{' '}
            <Link
              href="/register"
              className="font-semibold text-primary transition-colors hover:text-primary"
            >
              {t('signUp')}
            </Link>
          </p>
        </Card>
      </div>
    </main>
  )
}
