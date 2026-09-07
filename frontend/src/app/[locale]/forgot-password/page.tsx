'use client'

import { publicApiFetch } from '@/lib/auth'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

import { AuthPanel } from '@/components/auth/auth-panel'
import { ThemeBrandLogo } from '@/components/shared/brand-logo'
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
      const res = await publicApiFetch('/v1/auth/forgot-password', {
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

          <Link
            href="/login"
            className="mb-8 inline-flex items-center gap-2  text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            {t('backToLogin')}
          </Link>

          {sent ? (
            <div className="animate-slide-up">
              <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-emerald-300/15 bg-emerald-500/[0.08] mb-6">
                <Mail className="w-6 h-6 text-emerald-400" strokeWidth={1.75} />
              </div>
              <h1 className="text-3xl font-semibold leading-tight tracking-tight text-foreground">
                {t('checkEmailTitle')}
              </h1>
              <p className="mt-3  text-sm leading-6 text-muted-foreground">
                {t('checkEmailDesc')}
              </p>
              <Link
                href="/login"
                className="mt-8 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                <Check className="w-4 h-4" strokeWidth={1.75} />
                {t('backToLogin')}
              </Link>
            </div>
          ) : (
            <>
              <h1 className="text-3xl font-semibold leading-tight tracking-tight text-foreground">
                {t('forgotTitle')}
              </h1>
              <p className="mt-3  text-sm leading-6 text-muted-foreground">
                {t('forgotDesc')}
              </p>

              <form onSubmit={(e) => void submit(e)} className="mt-7 space-y-4">
                <div className="space-y-1.5">
                  <Label
                    htmlFor="email"
                    className="text-sm font-medium text-foreground"
                  >
                    {t('email')}
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required={true}
                    placeholder="name@example.com"
                    autoComplete="email"
                    className="h-11 rounded-lg bg-background"
                  />
                </div>
                <Button
                  type="submit"
                  disabled={busy || !email}
                  className="h-11 w-full"
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
                </Button>
              </form>
            </>
          )}
        </Card>
      </div>
    </main>
  )
}
