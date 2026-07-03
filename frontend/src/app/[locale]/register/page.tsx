'use client'

import { AuthPanel } from '@/components/auth/auth-panel'
import { PasswordInput } from '@/components/auth/password-input'
import { useToast } from '@/components/ui/toast'
import { Link, useRouter } from '@/i18n/navigation'
import { Check, Loader2, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import Image from 'next/image'
import { useMemo, useState } from 'react'

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

  const checks = useMemo(
    () => PASSWORD_RULES.map((r) => ({ ...r, pass: r.test(password) })),
    [password]
  )
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
    <main className="flex min-h-dvh">
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
      <div className="flex-1 flex items-center justify-center p-6 bg-background">
        <div className="w-full max-w-[380px] animate-fade-in">
          {/* Mobile logo */}
          <Link href="/" className="flex lg:hidden items-center gap-2 mb-10">
            <Image
              src="/logo.webp"
              alt="ClipForge"
              width={32}
              height={32}
              className="rounded-lg"
            />
            <span className="text-[15px] font-bold tracking-tight">
              ClipForge
            </span>
          </Link>

          <h1 className="text-2xl font-bold tracking-tight">
            {t('createAccount')}
          </h1>
          <p className="mt-1.5 text-[13px] text-muted-foreground">
            {t('createAccountDesc')}
          </p>

          <form
            action={(formData) => void submit(formData)}
            className="mt-7 space-y-4"
          >
            <div className="space-y-1.5">
              <label
                htmlFor="name"
                className="text-[12px] font-medium text-foreground/80"
              >
                {t('name')}
              </label>
              <input
                id="name"
                name="name"
                required={true}
                placeholder="John Doe"
                autoComplete="name"
                className="w-full rounded-xl border border-input bg-card px-4 py-2.5 text-[13px] placeholder:text-muted-foreground/40 focus:border-primary focus:ring-2 focus:ring-primary/15 transition-all outline-none"
              />
            </div>
            <div className="space-y-1.5">
              <label
                htmlFor="reg-email"
                className="text-[12px] font-medium text-foreground/80"
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
                className="w-full rounded-xl border border-input bg-card px-4 py-2.5 text-[13px] placeholder:text-muted-foreground/40 focus:border-primary focus:ring-2 focus:ring-primary/15 transition-all outline-none"
              />
            </div>
            <div className="space-y-1.5">
              <label
                htmlFor="reg-password"
                className="text-[12px] font-medium text-foreground/80"
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
                          className="w-3 h-3 text-emerald-500 shrink-0"
                          strokeWidth={3}
                        />
                      ) : (
                        <X
                          className="w-3 h-3 text-muted-foreground/30 shrink-0"
                          strokeWidth={2}
                        />
                      )}
                      <span
                        className={
                          c.pass
                            ? 'text-emerald-500'
                            : 'text-muted-foreground/50'
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
              className="w-full rounded-xl bg-gradient-to-r from-primary to-primary/90 px-4 py-3 text-[13px] font-semibold text-primary-foreground transition-all hover:opacity-90 hover:shadow-md hover:shadow-primary/20 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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

          <p className="mt-5 text-center text-[11px] text-muted-foreground/60 leading-relaxed">
            {t('agreeTerms')}{' '}
            <Link
              href="/terms"
              className="text-primary/80 hover:text-primary hover:underline"
            >
              {t('termsLink')}
            </Link>{' '}
            {t('andText')}{' '}
            <Link
              href="/privacy"
              className="text-primary/80 hover:text-primary hover:underline"
            >
              {t('privacyLink')}
            </Link>
          </p>

          <p className="mt-6 text-center text-[13px] text-muted-foreground">
            {t('hasAccount')}{' '}
            <Link
              href="/login"
              className="font-semibold text-primary hover:underline underline-offset-4"
            >
              {t('signIn')}
            </Link>
          </p>
        </div>
      </div>
    </main>
  )
}
