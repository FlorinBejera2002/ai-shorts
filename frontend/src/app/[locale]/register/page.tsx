'use client'

import { LoadingIndicator } from '@/components/ui/loading-indicator'
import { publicApiFetch } from '@/lib/auth'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

import { AuthPanel } from '@/components/auth/auth-panel'
import { PasswordInput } from '@/components/auth/password-input'
import { ThemeBrandLogo } from '@/components/shared/brand-logo'
import { useToast } from '@/components/ui/toast'
import { Link, useRouter } from '@/i18n/navigation'
import { Check, X } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useState } from 'react'

export default function RegisterPage() {
  const t = useTranslations('auth')
  const locale = useLocale()
  const [verificationEmail, setVerificationEmail] = useState<string | null>(
    null
  )

  const PASSWORD_RULES = [
    { label: t('passwordRules.length'), test: (p: string) => p.length >= 12 },
    {
      label: t('passwordRules.uppercase'),
      test: (p: string) => /[A-Z]/.test(p)
    },
    {
      label: t('passwordRules.lowercase'),
      test: (p: string) => /[a-z]/.test(p)
    },
    { label: t('passwordRules.number'), test: (p: string) => /\d/.test(p) },
    {
      label: t('passwordRules.special'),
      test: (p: string) => /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(p)
    }
  ]
  const router = useRouter()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [password, setPassword] = useState('')

  const checks = PASSWORD_RULES.map((rule) => ({
    ...rule,
    pass: rule.test(password)
  }))
  const allPass = checks.every((c) => c.pass)

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
        locale === 'ro'
          ? 'Verifică mesajele primite.'
          : 'Check your email for an activation link.'
      )
    } catch {
      toast.add('error', t('errorGeneric'))
    } finally {
      setBusy(false)
    }
  }
  if (verificationEmail)
    return (
      <main className="flex min-h-dvh items-center justify-center p-6">
        <Card className="w-full max-w-md p-8">
          <h1 className="text-2xl font-semibold">
            {locale === 'ro' ? 'Verifică adresa de email' : 'Verify your email'}
          </h1>
          <p className="text-sm text-muted-foreground">
            {locale === 'ro'
              ? 'Deschide linkul de activare trimis pe email, apoi autentifică-te.'
              : 'Open the activation link in your email, then sign in.'}
          </p>
          <Button disabled={busy} onClick={() => void resend()}>
            {locale === 'ro' ? 'Retrimite linkul' : 'Resend activation link'}
          </Button>
          <Button asChild={true} variant="outline">
            <Link href="/login">{t('signIn')}</Link>
          </Button>
        </Card>
      </main>
    )

  return (
    <main className="flex min-h-dvh bg-background text-foreground">
      <AuthPanel title={t('heroTitle')} desc={t('heroDesc')}>
        <div className="space-y-3 pt-2">
          {[
            t('featHighlights'),
            t('featCrop'),
            t('featCaptions'),
            t('featCredits')
          ].map((item) => (
            <div key={item} className="flex items-center gap-2.5">
              <div className="w-5 h-5 rounded-full bg-white/15 flex items-center justify-center">
                <Check className="w-3 h-3 text-white" strokeWidth={3} />
              </div>
              <span className="text-[13px] text-white/80">{item}</span>
            </div>
          ))}
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
            {t('createAccount')}
          </h1>
          <p className="mt-3  text-sm leading-6 text-muted-foreground">
            {t('createAccountDesc')}
          </p>

          <form
            action={(formData) => void submit(formData)}
            className="mt-7 space-y-4"
          >
            <div className="space-y-1.5">
              <Label
                htmlFor="name"
                className="text-sm font-medium text-foreground"
              >
                {t('name')}
              </Label>
              <Input
                id="name"
                name="name"
                required={true}
                placeholder="John Doe"
                autoComplete="name"
                className="h-11 rounded-lg bg-background"
              />
            </div>
            <div className="space-y-1.5">
              <Label
                htmlFor="reg-email"
                className="text-sm font-medium text-foreground"
              >
                {t('email')}
              </Label>
              <Input
                id="reg-email"
                name="email"
                type="email"
                required={true}
                placeholder="name@example.com"
                autoComplete="email"
                className="h-11 rounded-lg bg-background"
              />
            </div>
            <div className="space-y-1.5">
              <Label
                htmlFor="reg-password"
                className="text-sm font-medium text-foreground"
              >
                {t('password')}
              </Label>
              <PasswordInput
                id="reg-password"
                name="password"
                placeholder="••••••••••••"
                autoComplete="new-password"
                showLabel={t('showPassword')}
                hideLabel={t('hidePassword')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              {password.length > 0 && (
                <div className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-1.5 animate-slide-down">
                  {checks.map((c) => (
                    <div
                      key={c.label}
                      className="flex items-center gap-1.5 text-sm"
                    >
                      {c.pass ? (
                        <Check
                          className="w-3 h-3 text-emerald-400 shrink-0"
                          strokeWidth={3}
                        />
                      ) : (
                        <X
                          className="w-3 h-3 text-muted-foreground shrink-0"
                          strokeWidth={2}
                        />
                      )}
                      <span
                        className={
                          c.pass
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : 'text-muted-foreground'
                        }
                      >
                        {c.label}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <Button
              type="submit"
              disabled={busy || !allPass}
              className="h-11 w-full"
            >
              {busy ? (
                <>
                  <LoadingIndicator className="w-4 h-4" />
                  {t('creating')}
                </>
              ) : (
                t('createAccount')
              )}
            </Button>
          </form>

          <p className="mt-5 text-center  text-sm text-muted-foreground leading-relaxed">
            {t('agreeTerms')}{' '}
            <Link
              href="/terms"
              className="text-primary transition-colors hover:text-primary"
            >
              {t('termsLink')}
            </Link>{' '}
            {t('andText')}{' '}
            <Link
              href="/privacy"
              className="text-primary transition-colors hover:text-primary"
            >
              {t('privacyLink')}
            </Link>
          </p>

          <p className="mt-7 text-center  text-sm text-muted-foreground">
            {t('hasAccount')}{' '}
            <Link
              href="/login"
              className="font-semibold text-primary transition-colors hover:text-primary"
            >
              {t('signIn')}
            </Link>
          </p>
        </Card>
      </div>
    </main>
  )
}
