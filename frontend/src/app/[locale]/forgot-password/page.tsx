'use client'

import { useState } from 'react'
import { Film, Loader2, Mail } from 'lucide-react'
import { useToast } from '@/components/ui/toast'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'

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
        headers: { 'Content-Type': 'application/json' },
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
    <main className="flex min-h-dvh items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm animate-scale-in">
        <div className="flex items-center gap-2 mb-8">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
            <Film className="w-4 h-4 text-white" />
          </div>
          <span className="text-[15px] font-semibold tracking-tight">ClipForge</span>
        </div>

        {sent ? (
          <div className="animate-slide-up">
            <div className="w-12 h-12 rounded-xl bg-success/10 flex items-center justify-center mb-4">
              <Mail className="w-5 h-5 text-success" />
            </div>
            <h1 className="text-xl font-semibold tracking-tight">{t('checkEmailTitle')}</h1>
            <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
              {t('checkEmailDesc')}
            </p>
            <Link
              href="/login"
              className="mt-6 inline-flex text-xs font-medium text-primary hover:underline"
            >
              {t('backToLogin')}
            </Link>
          </div>
        ) : (
          <>
            <h1 className="text-xl font-semibold tracking-tight">{t('forgotTitle')}</h1>
            <p className="mt-1 text-xs text-muted-foreground">
              {t('forgotDesc')}
            </p>

            <form onSubmit={(e) => void submit(e)} className="mt-6 space-y-3">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required={true}
                placeholder={t('email')}
                className="w-full rounded-lg border border-input bg-card px-3 py-2.5 text-[13px] placeholder:text-muted-foreground/50 focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all"
              />
              <button
                type="submit"
                disabled={busy || !email}
                className="w-full rounded-lg bg-primary px-4 py-2.5 text-[13px] font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {busy ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    {t('sendingLabel')}
                  </>
                ) : (
                  t('sendResetLink')
                )}
              </button>
            </form>

            <p className="mt-6 text-center text-xs text-muted-foreground">
              <Link
                href="/login"
                className="font-medium text-primary hover:underline underline-offset-4"
              >
                {t('backToLogin')}
              </Link>
            </p>
          </>
        )}
      </div>
    </main>
  )
}
