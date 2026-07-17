'use client'

import { AuthPanel } from '@/components/auth/auth-panel'
import { useToast } from '@/components/ui/toast'
import { Link } from '@/i18n/navigation'
import { ArrowLeft, Check, Loader2, Mail } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

export default function ForgotPasswordPage() {
  const t = useTranslations('auth')
  const toast = useToast()
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email }),
        headers: { 'Content-Type': 'application/json' }
      })
      if (!res.ok) {
        const data = await res.json()
        toast.add('error', data.error ?? 'Failed to send reset email')
        return
      }
      setSent(true)
    } catch {
      toast.add('error', 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="flex min-h-dvh">
      <AuthPanel title={t('heroTitle')} desc={t('heroDesc')} />

      {/* Right — form */}
      <div className="flex-1 flex items-center justify-center p-6 bg-background">
        <div className="w-full max-w-[380px] animate-fade-in">
          <Link
            href="/login"
            className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors mb-8"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            {t('backToLogin')}
          </Link>

          {sent ? (
            <div className="animate-slide-up">
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-success/10 mb-6">
                <Mail className="w-6 h-6 text-success" strokeWidth={1.75} />
              </div>
              <h1 className="text-2xl font-bold tracking-tight">
                {t('checkEmailTitle')}
              </h1>
              <p className="mt-2 text-[13px] text-muted-foreground leading-relaxed">
                {t('checkEmailDesc')}
              </p>
              <Link
                href="/login"
                className="mt-8 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-all"
              >
                <Check className="w-4 h-4" strokeWidth={1.75} />
                Back to sign in
              </Link>
            </div>
          ) : (
            <>
              <h1 className="text-2xl font-bold tracking-tight">
                {t('forgotTitle')}
              </h1>
              <p className="mt-1 text-[13px] text-muted-foreground">
                {t('forgotDesc')}
              </p>

              <form onSubmit={(e) => void submit(e)} className="mt-7 space-y-4">
                <div className="space-y-1.5">
                  <label
                    htmlFor="email"
                    className="text-[12px] font-medium text-foreground/80"
                  >
                    {t('email')}
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required={true}
                    placeholder="name@example.com"
                    autoComplete="email"
                    className="w-full rounded-xl border border-input bg-card px-4 py-2.5 text-[13px] placeholder:text-muted-foreground/40 focus:border-primary focus:ring-2 focus:ring-primary/15 transition-all outline-none"
                  />
                </div>
                <button
                  type="submit"
                  disabled={busy || !email}
                  className="w-full rounded-xl bg-primary px-4 py-2.5 text-[13px] font-semibold text-primary-foreground transition-all hover:opacity-90 hover:shadow-lg hover:shadow-primary/20 disabled:cursor-not-allowed disabled:opacity-40 flex items-center justify-center gap-2"
                >
                  {busy ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      {t('sendingLabel')}
                    </>
                  ) : (
                    <>
                      <Mail className="w-4 h-4" strokeWidth={1.75} />
                      {t('sendResetLink')}
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
