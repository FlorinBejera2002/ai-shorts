'use client'

import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Film, Loader2, Check, X, ShieldCheck } from 'lucide-react'
import { useToast } from '@/components/ui/toast'
import { useTranslations } from 'next-intl'

export default function ResetPasswordPage() {
  const t = useTranslations('auth')

  const RULES = [
    { id: 'length', label: t('passwordRules.length'), test: (p: string) => p.length >= 12 },
    { id: 'upper', label: t('passwordRules.uppercase'), test: (p: string) => /[A-Z]/.test(p) },
    { id: 'lower', label: t('passwordRules.lowercase'), test: (p: string) => /[a-z]/.test(p) },
    { id: 'digit', label: t('passwordRules.number'), test: (p: string) => /\d/.test(p) },
    { id: 'special', label: t('passwordRules.special'), test: (p: string) => /[^A-Za-z0-9]/.test(p) },
  ]

  return (
    <Suspense fallback={
      <main className="flex min-h-dvh items-center justify-center bg-background p-6">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </main>
    }>
      <ResetPasswordForm t={t} RULES={RULES} />
    </Suspense>
  )
}

function ResetPasswordForm({ t, RULES }: { t: any; RULES: any[] }) {
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
        headers: { 'Content-Type': 'application/json' },
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
      <main className="flex min-h-dvh items-center justify-center bg-background p-6">
        <div className="w-full max-w-sm text-center animate-scale-in">
          <h1 className="text-xl font-semibold tracking-tight">Invalid reset link</h1>
          <p className="mt-2 text-xs text-muted-foreground">
            This link is missing required parameters. Please request a new one.
          </p>
          <a
            href="/forgot-password"
            className="mt-4 inline-flex text-xs font-medium text-primary hover:underline"
          >
            {t('sendResetLink')}
          </a>
        </div>
      </main>
    )
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm animate-scale-in">
        <div className="flex items-center gap-2 mb-8">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
            <Film className="w-4 h-4 text-white" />
          </div>
          <span className="text-[15px] font-semibold tracking-tight">ClipForge</span>
        </div>

        {done ? (
          <div className="animate-slide-up">
            <div className="w-12 h-12 rounded-xl bg-success/10 flex items-center justify-center mb-4">
              <ShieldCheck className="w-5 h-5 text-success" />
            </div>
            <h1 className="text-xl font-semibold tracking-tight">Password updated</h1>
            <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
              Your password has been reset. You can now sign in with your new password.
            </p>
            <a
              href="/login"
              className="mt-6 inline-flex rounded-lg bg-primary px-4 py-2.5 text-[13px] font-semibold text-primary-foreground transition-opacity hover:opacity-90"
            >
              {t('signIn')}
            </a>
          </div>
        ) : (
          <>
            <h1 className="text-xl font-semibold tracking-tight">{t('resetTitle')}</h1>
            <p className="mt-1 text-xs text-muted-foreground">
              {t('resetDesc')}
            </p>

            <form onSubmit={(e) => void submit(e)} className="mt-6 space-y-3">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t('password')}
                className="w-full rounded-lg border border-input bg-card px-3 py-2.5 text-[13px] placeholder:text-muted-foreground/50 focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all"
              />
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder={t('password')}
                className="w-full rounded-lg border border-input bg-card px-3 py-2.5 text-[13px] placeholder:text-muted-foreground/50 focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all"
              />

              {password.length > 0 && (
                <ul className="space-y-1 pt-1">
                  {RULES.map((r) => {
                    const ok = r.test(password)
                    return (
                      <li
                        key={r.id}
                        className={`flex items-center gap-1.5 text-[11px] transition-colors ${ok ? 'text-success' : 'text-muted-foreground'}`}
                      >
                        {ok ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                        {r.label}
                      </li>
                    )
                  })}
                  <li
                    className={`flex items-center gap-1.5 text-[11px] transition-colors ${match ? 'text-success' : 'text-muted-foreground'}`}
                  >
                    {match ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                    Passwords match
                  </li>
                </ul>
              )}

              <button
                type="submit"
                disabled={busy || !allPass || !match}
                className="w-full rounded-lg bg-primary px-4 py-2.5 text-[13px] font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {busy ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Resetting...
                  </>
                ) : (
                  t('resetButton')
                )}
              </button>
            </form>
          </>
        )}
      </div>
    </main>
  )
}
