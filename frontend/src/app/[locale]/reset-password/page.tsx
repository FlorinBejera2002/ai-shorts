'use client'

import { AuthPanel } from '@/components/auth/auth-panel'
import { BrandLogo } from '@/components/shared/brand-logo'
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
        <main
          aria-busy="true"
          className="dark flex min-h-dvh items-center justify-center bg-[#060608] p-6"
        >
          <h1 className="sr-only">{t('resetTitle')}</h1>
          <Loader2
            aria-hidden="true"
            className="w-5 h-5 animate-spin text-white/30"
          />
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
      <main className="dark flex min-h-dvh bg-[#060608] text-white">
        <AuthPanel title={t('heroTitle')} desc={t('heroDesc')} />
        <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-[#060608] p-5 sm:p-8">
          <div className="pointer-events-none absolute right-[-20%] top-[-20%] h-[520px] w-[520px] rounded-full bg-violet-500/[0.055] blur-[110px]" />
          <div className="relative w-full max-w-[430px] text-center animate-scale-in rounded-[24px] border border-white/[0.08] bg-[#0b0a0e]/90 p-6 shadow-[0_28px_90px_rgba(0,0,0,0.34),inset_0_1px_0_rgba(255,255,255,0.035)] sm:p-8">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl border border-red-300/15 bg-red-500/[0.08] mb-6">
              <AlertCircle
                className="w-6 h-6 text-red-400"
                strokeWidth={1.75}
              />
            </div>
            <h1 className="font-[family-name:var(--font-cinematic)] text-3xl font-medium tracking-[-0.045em] text-white">
              {t('invalidResetLink')}
            </h1>
            <p className="mt-3 font-[family-name:var(--font-studio)] text-[12px] leading-6 text-white/35">
              {t('resetLinkMissing')}
            </p>
            <Link
              href="/forgot-password"
              className="mt-8 inline-flex rounded-[13px] border border-white bg-white px-5 py-3 font-[family-name:var(--font-studio)] text-[11px] font-bold uppercase tracking-[0.12em] text-black shadow-[0_14px_35px_rgba(139,92,246,0.16)] transition-all hover:-translate-y-0.5 hover:shadow-[0_18px_45px_rgba(139,92,246,0.28)] active:scale-[0.98]"
            >
              {t('sendResetLink')}
            </Link>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="dark flex min-h-dvh bg-[#060608] text-white">
      <AuthPanel title={t('heroTitle')} desc={t('heroDesc')} />

      {/* Right — form */}
      <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-[#060608] p-5 sm:p-8">
        <div className="pointer-events-none absolute right-[-20%] top-[-20%] h-[520px] w-[520px] rounded-full bg-violet-500/[0.055] blur-[110px]" />
        <div className="relative w-full max-w-[430px] animate-fade-in rounded-[24px] border border-white/[0.08] bg-[#0b0a0e]/90 p-6 shadow-[0_28px_90px_rgba(0,0,0,0.34),inset_0_1px_0_rgba(255,255,255,0.035)] sm:p-8">
          {/* Mobile logo */}
          <Link href="/" className="mb-9 flex items-center gap-2 lg:hidden">
            <BrandLogo onDark={true} priority={true} />
          </Link>

          {done ? (
            <div className="animate-slide-up">
              <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-emerald-300/15 bg-emerald-500/[0.08] mb-6">
                <ShieldCheck
                  className="w-6 h-6 text-emerald-400"
                  strokeWidth={1.75}
                />
              </div>
              <h1 className="font-[family-name:var(--font-cinematic)] text-4xl font-medium leading-none tracking-[-0.045em] text-white">
                {t('resetCompleteTitle')}
              </h1>
              <p className="mt-3 font-[family-name:var(--font-studio)] text-[12px] leading-6 text-white/35">
                {t('resetCompleteDesc')}
              </p>
              <Link
                href="/login"
                className="mt-8 inline-flex rounded-[13px] border border-white bg-white px-5 py-3 font-[family-name:var(--font-studio)] text-[11px] font-bold uppercase tracking-[0.12em] text-black shadow-[0_14px_35px_rgba(139,92,246,0.16)] transition-all hover:-translate-y-0.5 hover:shadow-[0_18px_45px_rgba(139,92,246,0.28)] active:scale-[0.98]"
              >
                {t('signIn')}
              </Link>
            </div>
          ) : (
            <>
              <h1 className="font-[family-name:var(--font-cinematic)] text-4xl font-medium leading-none tracking-[-0.045em] text-white">
                {t('resetTitle')}
              </h1>
              <p className="mt-3 font-[family-name:var(--font-studio)] text-[12px] leading-6 text-white/35">
                {t('resetDesc')}
              </p>

              <form onSubmit={(e) => void submit(e)} className="mt-7 space-y-4">
                <div className="space-y-1.5">
                  <label
                    htmlFor="password"
                    className="font-[family-name:var(--font-studio)] text-[10px] font-semibold uppercase tracking-[0.1em] text-white/45"
                  >
                    {t('password')}
                  </label>
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full rounded-[13px] border border-white/10 bg-white/[0.035] px-4 py-3 font-[family-name:var(--font-studio)] text-[13px] text-white outline-none transition-all placeholder:text-white/20 focus:border-violet-300/35 focus:bg-white/[0.05] focus:ring-2 focus:ring-violet-400/10"
                  />
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="confirm"
                    className="font-[family-name:var(--font-studio)] text-[10px] font-semibold uppercase tracking-[0.1em] text-white/45"
                  >
                    {t('password')} (confirm)
                  </label>
                  <input
                    id="confirm"
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full rounded-[13px] border border-white/10 bg-white/[0.035] px-4 py-3 font-[family-name:var(--font-studio)] text-[13px] text-white outline-none transition-all placeholder:text-white/20 focus:border-violet-300/35 focus:bg-white/[0.05] focus:ring-2 focus:ring-violet-400/10"
                  />
                </div>

                {password.length > 0 && (
                  <div className="rounded-[13px] border border-white/[0.08] bg-white/[0.02] p-3 space-y-1.5 animate-slide-down">
                    <p className="font-[family-name:var(--font-studio)] text-[9px] font-bold uppercase tracking-[0.15em] text-white/30">
                      {t('passwordRules.length')}
                    </p>
                    <ul className="space-y-1">
                      {RULES.map((r) => {
                        const ok = r.test(password)
                        return (
                          <li
                            key={r.id}
                            className={`flex items-center gap-2 text-[12px] transition-colors ${
                              ok ? 'text-emerald-400' : 'text-white/30'
                            }`}
                          >
                            {ok ? (
                              <Check
                                className="w-3.5 h-3.5 shrink-0 text-emerald-400"
                                strokeWidth={2.5}
                              />
                            ) : (
                              <X
                                className="w-3.5 h-3.5 shrink-0 text-white/20"
                                strokeWidth={2.5}
                              />
                            )}
                            {r.label}
                          </li>
                        )
                      })}
                      <li
                        className={`flex items-center gap-2 text-[12px] transition-colors border-t border-white/[0.06] pt-1.5 mt-1.5 ${
                          match ? 'text-emerald-400' : 'text-white/30'
                        }`}
                      >
                        {match ? (
                          <Check
                            className="w-3.5 h-3.5 shrink-0 text-emerald-400"
                            strokeWidth={2.5}
                          />
                        ) : (
                          <X
                            className="w-3.5 h-3.5 shrink-0 text-white/20"
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
                  className="flex w-full items-center justify-center gap-2 rounded-[13px] border border-white bg-white px-4 py-3 font-[family-name:var(--font-studio)] text-[11px] font-bold uppercase tracking-[0.12em] text-black shadow-[0_14px_35px_rgba(139,92,246,0.16)] transition-all hover:-translate-y-0.5 hover:shadow-[0_18px_45px_rgba(139,92,246,0.28)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 mt-2"
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
