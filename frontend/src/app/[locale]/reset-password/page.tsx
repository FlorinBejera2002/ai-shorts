'use client'

import { LoadingIndicator } from '@/components/ui/loading-indicator'
import { publicApiFetch } from '@/lib/auth'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

import { AuthPanel } from '@/components/auth/auth-panel'
import { ThemeBrandLogo } from '@/components/shared/brand-logo'
import { useToast } from '@/components/ui/toast'
import { Link } from '@/i18n/navigation'
import { AlertCircle, Check, ShieldCheck, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useSearchParams } from 'next/navigation'
import { Suspense, useState } from 'react'

type TFunc = ReturnType<typeof useTranslations>
type PasswordRule = { id: string; label: string; test: (p: string) => boolean }

export default function ResetPasswordPage() {
  const t = useTranslations('auth')

  const RULES = [
    {
      id: 'length',
      label: t('passwordRules.length'),
      test: (p: string) => p.length >= 12
    },
    {
      id: 'upper',
      label: t('passwordRules.uppercase'),
      test: (p: string) => /[A-Z]/.test(p)
    },
    {
      id: 'lower',
      label: t('passwordRules.lowercase'),
      test: (p: string) => /[a-z]/.test(p)
    },
    {
      id: 'digit',
      label: t('passwordRules.number'),
      test: (p: string) => /\d/.test(p)
    },
    {
      id: 'special',
      label: t('passwordRules.special'),
      test: (p: string) => /[^A-Za-z0-9]/.test(p)
    }
  ]

  return (
    <Suspense
      fallback={
        <main
          aria-busy="true"
          className="flex min-h-dvh bg-background text-foreground"
        >
          <h1 className="text-3xl font-semibold leading-tight tracking-tight text-foreground">
            {t('resetTitle')}
          </h1>
          <LoadingIndicator className="w-5 h-5 text-muted-foreground" />
        </main>
      }
    >
      <ResetPasswordForm t={t} RULES={RULES} />
    </Suspense>
  )
}

function ResetPasswordForm({ t, RULES }: { t: TFunc; RULES: PasswordRule[] }) {
  const toast = useToast()
  const params = useSearchParams()
  const token = params.get('token') ?? ''

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  const allPass = RULES.every((r) => r.test(password))
  const match = password.length > 0 && password === confirm

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!allPass || !match) return
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
      <main className="flex min-h-dvh bg-background text-foreground">
        <AuthPanel title={t('heroTitle')} desc={t('heroDesc')} />
        <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-background p-5 sm:p-8">
          <div className="hidden" />
          <Card className="relative block w-full max-w-md gap-0 rounded-2xl border bg-card p-6 shadow-sm sm:p-9">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl border border-red-300/15 bg-red-500/[0.08] mb-6">
              <AlertCircle
                className="w-6 h-6 text-red-400"
                strokeWidth={1.75}
              />
            </div>
            <h1 className="text-3xl font-semibold leading-tight tracking-tight text-foreground">
              {t('invalidResetLink')}
            </h1>
            <p className="mt-3  text-sm leading-6 text-muted-foreground">
              {t('resetLinkMissing')}
            </p>
            <Link
              href="/forgot-password"
              className="mt-8 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              {t('sendResetLink')}
            </Link>
          </Card>
        </div>
      </main>
    )
  }

  return (
    <main className="flex min-h-dvh bg-background text-foreground">
      <AuthPanel title={t('heroTitle')} desc={t('heroDesc')} />

      {/* Right — form */}
      <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-background p-5 sm:p-8">
        <div className="hidden" />
        <Card className="relative block w-full max-w-md gap-0 rounded-2xl border bg-card p-6 shadow-sm sm:p-9">
          {/* Mobile logo */}
          <Link href="/" className="mb-9 flex items-center gap-2 lg:hidden">
            <ThemeBrandLogo />
          </Link>

          {done ? (
            <div className="animate-slide-up">
              <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-emerald-300/15 bg-emerald-500/[0.08] mb-6">
                <ShieldCheck
                  className="w-6 h-6 text-emerald-400"
                  strokeWidth={1.75}
                />
              </div>
              <h1 className="text-3xl font-semibold leading-tight tracking-tight text-foreground">
                {t('resetCompleteTitle')}
              </h1>
              <p className="mt-3  text-sm leading-6 text-muted-foreground">
                {t('resetCompleteDesc')}
              </p>
              <Link
                href="/login"
                className="mt-8 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                {t('signIn')}
              </Link>
            </div>
          ) : (
            <>
              <h1 className="text-3xl font-semibold leading-tight tracking-tight text-foreground">
                {t('resetTitle')}
              </h1>
              <p className="mt-3  text-sm leading-6 text-muted-foreground">
                {t('resetDesc')}
              </p>

              <form onSubmit={(e) => void submit(e)} className="mt-7 space-y-4">
                <div className="space-y-1.5">
                  <Label
                    htmlFor="password"
                    className="text-sm font-medium text-foreground"
                  >
                    {t('password')}
                  </Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="h-11 rounded-lg bg-background"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label
                    htmlFor="confirm"
                    className="text-sm font-medium text-foreground"
                  >
                    {t('password')} (confirm)
                  </Label>
                  <Input
                    id="confirm"
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="••••••••••••"
                    className="h-11 rounded-lg bg-background"
                  />
                </div>

                {password.length > 0 && (
                  <div className="rounded-[13px] border border-border bg-muted p-3 space-y-1.5 animate-slide-down">
                    <p className=" text-sm font-bold uppercase tracking-[0.15em] text-muted-foreground">
                      {t('passwordRules.length')}
                    </p>
                    <ul className="space-y-1">
                      {RULES.map((r) => {
                        const ok = r.test(password)
                        return (
                          <li
                            key={r.id}
                            className={`flex items-center gap-2 text-[12px] transition-colors ${
                              ok
                                ? 'text-emerald-700 dark:text-emerald-400'
                                : 'text-muted-foreground'
                            }`}
                          >
                            {ok ? (
                              <Check
                                className="w-3.5 h-3.5 shrink-0 text-emerald-400"
                                strokeWidth={2.5}
                              />
                            ) : (
                              <X
                                className="w-3.5 h-3.5 shrink-0 text-muted-foreground"
                                strokeWidth={2.5}
                              />
                            )}
                            {r.label}
                          </li>
                        )
                      })}
                      <li
                        className={`flex items-center gap-2 text-[12px] transition-colors border-t border-border pt-1.5 mt-1.5 ${
                          match
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : 'text-muted-foreground'
                        }`}
                      >
                        {match ? (
                          <Check
                            className="w-3.5 h-3.5 shrink-0 text-emerald-400"
                            strokeWidth={2.5}
                          />
                        ) : (
                          <X
                            className="w-3.5 h-3.5 shrink-0 text-muted-foreground"
                            strokeWidth={2.5}
                          />
                        )}
                        {t('passwordsMatch')}
                      </li>
                    </ul>
                  </div>
                )}

                <Button
                  type="submit"
                  disabled={busy || !allPass || !match}
                  className="h-11 w-full"
                >
                  {busy ? (
                    <>
                      <LoadingIndicator className="w-4 h-4" />
                      {t('signingIn')}
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-4 h-4" strokeWidth={1.75} />
                      {t('resetButton')}
                    </>
                  )}
                </Button>
              </form>
            </>
          )}
        </Card>
      </div>
    </main>
  )
}
