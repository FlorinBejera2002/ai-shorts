'use client'

import { useMemo, useState } from 'react'
import { useRouter, Link } from '@/i18n/navigation'
import { Check, Film, Loader2, X } from 'lucide-react'
import { useToast } from '@/components/ui/toast'
import { useTranslations } from 'next-intl'

export default function RegisterPage() {
  const t = useTranslations('auth')

  const PASSWORD_RULES = [
    { label: t('passwordRules.length'), test: (p: string) => p.length >= 12 },
    { label: t('passwordRules.uppercase'), test: (p: string) => /[A-Z]/.test(p) },
    { label: t('passwordRules.lowercase'), test: (p: string) => /[a-z]/.test(p) },
    { label: t('passwordRules.number'), test: (p: string) => /\d/.test(p) },
    { label: t('passwordRules.special'), test: (p: string) => /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(p) },
  ]
  const router = useRouter()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [password, setPassword] = useState('')

  const checks = useMemo(() => PASSWORD_RULES.map(r => ({ ...r, pass: r.test(password) })), [password])
  const allPass = checks.every(c => c.pass)

  async function submit(formData: FormData) {
    if (!allPass) {
      toast.add('error', t('passwordWeak'))
      return
    }
    setBusy(true)
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          name: formData.get('name'),
          email: formData.get('email'),
          password: formData.get('password'),
        }),
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
    <main className="flex min-h-dvh items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm animate-scale-in">
        <div className="flex items-center gap-2 mb-8">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
            <Film className="w-4 h-4 text-white" />
          </div>
          <span className="text-[15px] font-semibold tracking-tight">ClipForge</span>
        </div>

        <h1 className="text-xl font-semibold tracking-tight">{t('createAccount')}</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          {t('createAccountDesc')}
        </p>

        <form
          action={(formData) => void submit(formData)}
          className="mt-6 space-y-3"
        >
          <input
            name="name"
            required={true}
            placeholder={t('name')}
            className="w-full rounded-lg border border-input bg-card px-3 py-2.5 text-[13px] placeholder:text-muted-foreground/50 focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all"
          />
          <input
            name="email"
            type="email"
            required={true}
            placeholder={t('email')}
            className="w-full rounded-lg border border-input bg-card px-3 py-2.5 text-[13px] placeholder:text-muted-foreground/50 focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all"
          />
          <div>
            <input
              name="password"
              type="password"
              required={true}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t('password')}
              className="w-full rounded-lg border border-input bg-card px-3 py-2.5 text-[13px] placeholder:text-muted-foreground/50 focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all"
            />
            {password.length > 0 && (
              <div className="mt-2 space-y-1 animate-slide-down">
                {checks.map((c) => (
                  <div key={c.label} className="flex items-center gap-1.5 text-[11px]">
                    {c.pass ? (
                      <Check className="w-3 h-3 text-green-500" />
                    ) : (
                      <X className="w-3 h-3 text-muted-foreground/40" />
                    )}
                    <span className={c.pass ? 'text-green-500' : 'text-muted-foreground/60'}>
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
            className="w-full rounded-lg bg-primary px-4 py-2.5 text-[13px] font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {busy ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                {t('creating')}
              </>
            ) : (
              t('createAccount')
            )}
          </button>
        </form>

        <p className="mt-4 text-center text-[11px] text-muted-foreground/70">
          {t('agreeTerms')}{' '}
          <Link href="/terms" className="text-primary hover:underline">{t('termsLink')}</Link>
          {' '}{t('andText')}{' '}
          <Link href="/privacy" className="text-primary hover:underline">{t('privacyLink')}</Link>
        </p>

        <p className="mt-3 text-center text-xs text-muted-foreground">
          {t('hasAccount')}{' '}
          <Link
            href="/login"
            className="font-medium text-primary hover:underline underline-offset-4"
          >
            {t('signIn')}
          </Link>
        </p>
      </div>
    </main>
  )
}
