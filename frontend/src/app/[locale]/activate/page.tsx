'use client'

import { AuthCanvasLayout } from '@/components/auth/auth-canvas-layout'
import {
  AuthAccountPrompt,
  AuthHeading,
  AuthNotice
} from '@/components/auth/auth-card-parts'
import { CanvasButton } from '@/components/auth/canvas-button'
import { ApiState } from '@/components/shared/api-state'
import { useToast } from '@/components/ui/toast'
import { publicApiFetch } from '@/lib/auth'
import { useTranslations } from 'next-intl'
import { useSearchParams } from 'next/navigation'
import { Suspense, useState } from 'react'

export default function ActivatePage() {
  return (
    <Suspense fallback={<ApiState />}>
      <ActivationContent />
    </Suspense>
  )
}

function ActivationContent() {
  const t = useTranslations('auth')
  const tc = useTranslations('authCanvas')
  const addToast = useToast((state) => state.add)
  const token = useSearchParams().get('token')
  const [status, setStatus] = useState<'idle' | 'busy' | 'done'>('idle')

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
      setStatus('idle')
      addToast('error', tc('activate.invalidLink'))
    }
  }

  if (status === 'done') {
    return (
      <AuthCanvasLayout screen="activateDone">
        <AuthHeading
          centered={true}
          title={tc('activateDone.title')}
          description={tc('activateDone.description')}
        />
        <CanvasButton href="/login">{t('signIn')}</CanvasButton>
        <AuthAccountPrompt kind="noAccount" />
      </AuthCanvasLayout>
    )
  }

  return (
    <AuthCanvasLayout screen="activate">
      <AuthHeading
        centered={true}
        title={tc('activate.title')}
        description={tc('activate.description')}
      />
      {!token && <AuthNotice>{tc('activate.invalidLink')}</AuthNotice>}
      <CanvasButton
        disabled={!token || status === 'busy'}
        onClick={() => void activate()}
      >
        {tc('activate.submit')}
      </CanvasButton>
      <CanvasButton variant="secondary" href="/login">
        {t('backToLogin')}
      </CanvasButton>
      <AuthAccountPrompt kind="noAccount" />
    </AuthCanvasLayout>
  )
}
