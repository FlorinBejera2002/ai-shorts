'use client'
import { ApiState } from '@/components/shared/api-state'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Link } from '@/i18n/navigation'
import { publicApiFetch } from '@/lib/auth'
import { useLocale } from 'next-intl'
import { useSearchParams } from 'next/navigation'
import { Suspense, useState } from 'react'
export default function ActivatePage() {
  return (
    <Suspense fallback={<ApiState />}>
      <ActivationForm />
    </Suspense>
  )
}
function ActivationForm() {
  const token = useSearchParams().get('token')
  const ro = useLocale() === 'ro'
  const [status, setStatus] = useState<'idle' | 'busy' | 'done' | 'error'>(
    'idle'
  )
  async function activate() {
    setStatus('busy')
    try {
      const response = await publicApiFetch('/v1/auth/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token })
      })
      if (!response.ok) throw new Error('Activation failed')
      setStatus('done')
    } catch {
      setStatus('error')
    }
  }
  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <Card className="w-full max-w-md p-8">
        <h1 className="text-2xl font-semibold">
          {ro ? 'Activează contul' : 'Activate your account'}
        </h1>
        {status === 'done' ? (
          <>
            <p role="status">
              {ro
                ? 'Contul este activ. Te poți autentifica.'
                : 'Your account is active. You can sign in.'}
            </p>
            <Button asChild={true}>
              <Link href="/login">{ro ? 'Autentificare' : 'Sign in'}</Link>
            </Button>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              {ro
                ? 'Confirmă adresa de email pentru a continua.'
                : 'Confirm your email address to continue.'}
            </p>
            {(!token || status === 'error') && (
              <p role="alert">
                {ro
                  ? 'Linkul este invalid sau a expirat.'
                  : 'This link is invalid or has expired.'}
              </p>
            )}
            <Button
              disabled={!token || status === 'busy'}
              onClick={() => void activate()}
            >
              {ro ? 'Confirmă emailul' : 'Confirm email'}
            </Button>
            <Button asChild={true} variant="outline">
              <Link href="/login">
                {ro ? 'Înapoi la autentificare' : 'Back to sign in'}
              </Link>
            </Button>
          </>
        )}
      </Card>
    </main>
  )
}
