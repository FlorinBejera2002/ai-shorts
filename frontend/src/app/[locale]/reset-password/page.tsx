'use client'

import { AuthPanel } from '@/components/auth/auth-panel'
import { useToast } from '@/components/ui/toast'
import { Link } from '@/i18n/navigation'
import { AlertCircle, Check, Loader2, ShieldCheck, X } from 'lucide-react'
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
        <main className="flex min-h-dvh items-center justify-center bg-background p-6">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
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
  const email = params.get('email') ?? ''

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
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, email, password }),
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

  if (!token || !email) {
    return (
      <main className="flex min-h-dvh">
        <AuthPanel title={t('heroTitle')} desc={t('heroDesc')} />
        <div className="flex-1 flex items-center justify-center p-6 bg-background">
          <div className="w-full max-w-[380px] text-center animate-scale-in">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-destructive/10 mx-auto mb-6">
              <AlertCircle
                className="w-6 h-6 text-destructive"
                strokeWidth={1.75}
              />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">
              {t('invalidResetLink')}
            </h1>
            <p className="mt-2 text-[13px] text-muted-foreground leading-relaxed">
              {t('resetLinkMissing')}
            </p>
            <Link
              href="/forgot-password"
              className="mt-8 inline-flex rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-all"
            >
              {t('sendResetLink')}
            </Link>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="flex min-h-dvh">
      <AuthPanel title={t('heroTitle')} desc={t('heroDesc')} />

      {/* Right — form */}
      <div className="flex-1 flex items-center justify-center p-6 bg-background">
        <div className="w-full max-w-[380px] animate-fade-in">
          {done ? (
            <div className="animate-slide-up">
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-success/10 mb-6">
                <ShieldCheck
                  className="w-6 h-6 text-success"
                  strokeWidth={1.75}
                />
              </div>
              <h1 className="text-2xl font-bold tracking-tight">
                {t('resetCompleteTitle')}
              </h1>
              <p className="mt-2 text-[13px] text-muted-foreground leading-relaxed">
                {t('resetCompleteDesc')}
              </p>
              <Link
                href="/login"
                className="mt-8 inline-flex rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-all"
              >
                {t('signIn')}
              </Link>
            </div>
          ) : (
            <>
              <h1 className="text-2xl font-bold tracking-tight">
                {t('resetTitle')}
              </h1>
              <p className="mt-1 text-[13px] text-muted-foreground">
                {t('resetDesc')}
              </p>

              <form onSubmit={(e) => void submit(e)} className="mt-7 space-y-4">
                {/* Password input */}
                <div className="space-y-1.5">
                  <label
                    htmlFor="password"
                    className="text-[12px] font-medium text-foreground/80"
                  >
                    {t('password')}
                  </label>
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full rounded-xl border border-input bg-card px-4 py-2.5 text-[13px] placeholder:text-muted-foreground/40 focus:border-primary focus:ring-2 focus:ring-primary/15 transition-all outline-none"
                  />
                </div>

                {/* Confirm password */}
                <div className="space-y-1.5">
                  <label
                    htmlFor="confirm"
                    className="text-[12px] font-medium text-foreground/80"
                  >
                    {t('password')} (confirm)
                  </label>
                  <input
                    id="confirm"
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full rounded-xl border border-input bg-card px-4 py-2.5 text-[13px] placeholder:text-muted-foreground/40 focus:border-primary focus:ring-2 focus:ring-primary/15 transition-all outline-none"
                  />
                </div>

                {/* Password requirements */}
                {password.length > 0 && (
                  <div className="rounded-lg border border-border bg-card/50 p-3 space-y-1.5 animate-slide-down">
                    <p className="text-[11px] font-semibold text-foreground/70 uppercase tracking-wider">
                      {t('passwordRules.length')}
                    </p>
                    <ul className="space-y-1">
                      {RULES.map((r) => {
                        const ok = r.test(password)
                        return (
                          <li
                            key={r.id}
                            className={`flex items-center gap-2 text-[12px] transition-colors ${
                              ok ? 'text-success' : 'text-muted-foreground'
                            }`}
                          >
                            {ok ? (
                              <Check
                                className="w-3.5 h-3.5 shrink-0 text-success"
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
                          match ? 'text-success' : 'text-muted-foreground'
                        }`}
                      >
                        {match ? (
                          <Check
                            className="w-3.5 h-3.5 shrink-0 text-success"
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

                <button
                  type="submit"
                  disabled={busy || !allPass || !match}
                  className="w-full rounded-xl bg-primary px-4 py-2.5 text-[13px] font-semibold text-primary-foreground transition-all hover:opacity-90 hover:shadow-lg hover:shadow-primary/20 disabled:cursor-not-allowed disabled:opacity-40 flex items-center justify-center gap-2 mt-6"
                >
                  {busy ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      {t('signingIn')}
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-4 h-4" strokeWidth={1.75} />
                      {t('resetButton')}
                    </>
                  )}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </main>
  )
}
