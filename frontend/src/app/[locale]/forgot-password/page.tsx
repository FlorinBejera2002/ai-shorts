'use client'

import { AuthCanvasLayout } from '@/components/auth/auth-canvas-layout'
import {
  AuthAccountPrompt,
  AuthBackLink,
  AuthForm,
  AuthHeading
} from '@/components/auth/auth-card-parts'
import { CanvasButton } from '@/components/auth/canvas-button'
import { CanvasField } from '@/components/auth/canvas-field'
import { LoadingIndicator } from '@/components/ui/loading-indicator'
import { useToast } from '@/components/ui/toast'
import { publicApiFetch } from '@/lib/auth'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

export default function ForgotPasswordPage() {
  const t = useTranslations('auth')
  const tc = useTranslations('authCanvas')
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

  if (sent) {
    return (
      <AuthCanvasLayout screen="forgotSent">
        <AuthHeading
          centered={true}
          title={tc('forgotSent.title')}
          description={tc('forgotSent.description')}
        />
        <CanvasButton variant="secondary" href="/login">
          {t('backToLogin')}
        </CanvasButton>
        <AuthAccountPrompt kind="noAccount" />
      </AuthCanvasLayout>
    )
  }

  return (
    <AuthCanvasLayout screen="forgot">
      <AuthBackLink label={t('backToLogin')} href="/login" />
      <AuthHeading title={t('forgotTitle')} description={tc('forgot.description')} />
      <AuthForm onSubmit={(e) => void submit(e)}>
        <CanvasField
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required={true}
          label={t('email')}
          placeholder="name@example.com"
          autoComplete="email"
        />
        <CanvasButton type="submit" disabled={busy || !email}>
          {busy && <LoadingIndicator className="size-4" />}
          {busy ? t('sendingLabel') : tc('forgot.submit')}
        </CanvasButton>
      </AuthForm>
      <AuthAccountPrompt kind="noAccount" />
    </AuthCanvasLayout>
  )
}
