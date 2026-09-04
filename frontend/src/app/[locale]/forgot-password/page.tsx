'use client'

import { AuthPanel } from '@/components/auth/auth-panel'
import { BrandLogo } from '@/components/shared/brand-logo'
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

          <Link
            href="/login"
            className="mb-8 inline-flex items-center gap-2 font-[family-name:var(--font-studio)] text-[11px] font-medium text-white/35 transition-colors hover:text-white"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            {t('backToLogin')}
          </Link>

          {sent ? (
            <div className="animate-slide-up">
              <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-emerald-300/15 bg-emerald-500/[0.08] mb-6">
                <Mail className="w-6 h-6 text-emerald-400" strokeWidth={1.75} />
              </div>
              <h1 className="font-[family-name:var(--font-cinematic)] text-4xl font-medium leading-none tracking-[-0.045em] text-white">
                {t('checkEmailTitle')}
              </h1>
              <p className="mt-3 font-[family-name:var(--font-studio)] text-[12px] leading-6 text-white/35">
                {t('checkEmailDesc')}
              </p>
              <Link
                href="/login"
                className="mt-8 inline-flex items-center gap-2 rounded-[13px] border border-white bg-white px-5 py-3 font-[family-name:var(--font-studio)] text-[11px] font-bold uppercase tracking-[0.12em] text-black shadow-[0_14px_35px_rgba(139,92,246,0.16)] transition-all hover:-translate-y-0.5 hover:shadow-[0_18px_45px_rgba(139,92,246,0.28)] active:scale-[0.98]"
              >
                <Check className="w-4 h-4" strokeWidth={1.75} />
                {t('backToLogin')}
              </Link>
            </div>
          ) : (
            <>
              <h1 className="font-[family-name:var(--font-cinematic)] text-4xl font-medium leading-none tracking-[-0.045em] text-white">
                {t('forgotTitle')}
              </h1>
              <p className="mt-3 font-[family-name:var(--font-studio)] text-[12px] leading-6 text-white/35">
                {t('forgotDesc')}
              </p>

              <form onSubmit={(e) => void submit(e)} className="mt-7 space-y-4">
                <div className="space-y-1.5">
                  <label
                    htmlFor="email"
                    className="font-[family-name:var(--font-studio)] text-[10px] font-semibold uppercase tracking-[0.1em] text-white/45"
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
                    className="w-full rounded-[13px] border border-white/10 bg-white/[0.035] px-4 py-3 font-[family-name:var(--font-studio)] text-[13px] text-white outline-none transition-all placeholder:text-white/20 focus:border-violet-300/35 focus:bg-white/[0.05] focus:ring-2 focus:ring-violet-400/10"
                  />
                </div>
                <button
                  type="submit"
                  disabled={busy || !email}
                  className="flex w-full items-center justify-center gap-2 rounded-[13px] border border-white bg-white px-4 py-3 font-[family-name:var(--font-studio)] text-[11px] font-bold uppercase tracking-[0.12em] text-black shadow-[0_14px_35px_rgba(139,92,246,0.16)] transition-all hover:-translate-y-0.5 hover:shadow-[0_18px_45px_rgba(139,92,246,0.28)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
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
