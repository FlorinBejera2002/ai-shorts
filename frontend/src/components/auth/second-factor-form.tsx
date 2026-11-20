'use client'

import { SubmitButton } from '@/components/auth/submit-button'
import { useTranslations } from 'next-intl'
import { AuthAccountPrompt, AuthBackLink, AuthForm, AuthHeading, AuthNotice } from './auth-card-parts'
import { CanvasField } from './canvas-field'

interface SecondFactorFormProps {
  errorMessage: string | null
  onSubmit: (formData: FormData) => Promise<void>
  onBack: () => void
}

/** Two-step sign-in: asks for the authenticator or recovery code after the password was accepted. */
export function SecondFactorForm({
  errorMessage,
  onSubmit,
  onBack
}: SecondFactorFormProps) {
  const t = useTranslations('auth')
  const tc = useTranslations('authCanvas')

  return (
    <>
      <AuthHeading
        title={tc('mfa.title')}
        description={t('secondFactorHint')}
      />
      {errorMessage && <AuthNotice>{errorMessage}</AuthNotice>}
      <AuthForm action={onSubmit}>
        <CanvasField
          id="second-factor"
          name="secondFactor"
          label={tc('mfa.codeLabel')}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={19}
          required={true}
          autoFocus={true}
          placeholder={t('secondFactorPlaceholder')}
        />
        <SubmitButton label={tc('mfa.submit')} pendingLabel={t('signingIn')} />
      </AuthForm>
      <AuthBackLink label={t('backToLogin')} onClick={onBack} />
      <AuthAccountPrompt kind="noAccount" />
    </>
  )
}
