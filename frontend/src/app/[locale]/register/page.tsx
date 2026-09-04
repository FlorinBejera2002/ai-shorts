'use client'

import { AuthPanel } from '@/components/auth/auth-panel'
import { PasswordInput } from '@/components/auth/password-input'
import { BrandLogo } from '@/components/shared/brand-logo'
import { useToast } from '@/components/ui/toast'
import { Link, useRouter } from '@/i18n/navigation'
import { Check, Loader2, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

export default function RegisterPage() {
  const t = useTranslations('auth')

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
      const res = await fetch('/api/auth/register', {
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
      toast.add('success', t('accountCreated'))
      router.push('/login')
    } catch {
      toast.add('error', t('errorGeneric'))
      setBusy(false)
    }
  }

  return (
    <main className="dark flex min-h-dvh bg-[#060608] text-white">
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
      <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-[#060608] p-5 sm:p-8">
        <div className="pointer-events-none absolute right-[-20%] top-[-20%] h-[520px] w-[520px] rounded-full bg-violet-500/[0.055] blur-[110px]" />
        <div className="relative w-full max-w-[430px] animate-fade-in rounded-[24px] border border-white/[0.08] bg-[#0b0a0e]/90 p-6 shadow-[0_28px_90px_rgba(0,0,0,0.34),inset_0_1px_0_rgba(255,255,255,0.035)] sm:p-8">
          {/* Mobile logo */}
          <Link href="/" className="mb-9 flex items-center gap-2 lg:hidden">
            <BrandLogo onDark={true} />
          </Link>

          <h1 className="font-[family-name:var(--font-cinematic)] text-4xl font-medium leading-none tracking-[-0.045em] text-white">
            {t('createAccount')}
          </h1>
          <p className="mt-3 font-[family-name:var(--font-studio)] text-[12px] leading-6 text-white/35">
            {t('createAccountDesc')}
          </p>

          <form
            action={(formData) => void submit(formData)}
            className="mt-7 space-y-4"
          >
            <div className="space-y-1.5">
              <label
                htmlFor="name"
                className="font-[family-name:var(--font-studio)] text-[10px] font-semibold uppercase tracking-[0.1em] text-white/45"
              >
                {t('name')}
              </label>
              <input
                id="name"
                name="name"
                required={true}
                placeholder="John Doe"
                autoComplete="name"
                className="w-full rounded-[13px] border border-white/10 bg-white/[0.035] px-4 py-3 font-[family-name:var(--font-studio)] text-[13px] text-white outline-none transition-all placeholder:text-white/20 focus:border-violet-300/35 focus:bg-white/[0.05] focus:ring-2 focus:ring-violet-400/10"
              />
            </div>
            <div className="space-y-1.5">
              <label
                htmlFor="reg-email"
                className="font-[family-name:var(--font-studio)] text-[10px] font-semibold uppercase tracking-[0.1em] text-white/45"
              >
                {t('email')}
              </label>
              <input
                id="reg-email"
                name="email"
                type="email"
                required={true}
                placeholder="name@example.com"
                autoComplete="email"
                className="w-full rounded-[13px] border border-white/10 bg-white/[0.035] px-4 py-3 font-[family-name:var(--font-studio)] text-[13px] text-white outline-none transition-all placeholder:text-white/20 focus:border-violet-300/35 focus:bg-white/[0.05] focus:ring-2 focus:ring-violet-400/10"
              />
            </div>
            <div className="space-y-1.5">
              <label
                htmlFor="reg-password"
                className="font-[family-name:var(--font-studio)] text-[10px] font-semibold uppercase tracking-[0.1em] text-white/45"
              >
                {t('password')}
              </label>
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
                      className="flex items-center gap-1.5 text-[11px]"
                    >
                      {c.pass ? (
                        <Check
                          className="w-3 h-3 text-emerald-400 shrink-0"
                          strokeWidth={3}
                        />
                      ) : (
                        <X
                          className="w-3 h-3 text-white/20 shrink-0"
                          strokeWidth={2}
                        />
                      )}
                      <span
                        className={
                          c.pass ? 'text-emerald-400' : 'text-white/30'
                        }
                      >
                        {c.label}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <button
              type="submit"
              disabled={busy || !allPass}
              className="flex w-full items-center justify-center gap-2 rounded-[13px] border border-white bg-white px-4 py-3 font-[family-name:var(--font-studio)] text-[11px] font-bold uppercase tracking-[0.12em] text-black shadow-[0_14px_35px_rgba(139,92,246,0.16)] transition-all hover:-translate-y-0.5 hover:shadow-[0_18px_45px_rgba(139,92,246,0.28)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {t('creating')}
                </>
              ) : (
                t('createAccount')
              )}
            </button>
          </form>

          <p className="mt-5 text-center font-[family-name:var(--font-studio)] text-[10px] text-white/25 leading-relaxed">
            {t('agreeTerms')}{' '}
            <Link
              href="/terms"
              className="text-violet-300/65 transition-colors hover:text-violet-200"
            >
              {t('termsLink')}
            </Link>{' '}
            {t('andText')}{' '}
            <Link
              href="/privacy"
              className="text-violet-300/65 transition-colors hover:text-violet-200"
            >
              {t('privacyLink')}
            </Link>
          </p>

          <p className="mt-7 text-center font-[family-name:var(--font-studio)] text-[12px] text-white/35">
            {t('hasAccount')}{' '}
            <Link
              href="/login"
              className="font-semibold text-violet-300 transition-colors hover:text-violet-200"
            >
              {t('signIn')}
            </Link>
          </p>
        </div>
      </div>
    </main>
  )
}
