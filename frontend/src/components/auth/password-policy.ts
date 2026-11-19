import { useTranslations } from 'next-intl'

export const PASSWORD_MIN_LENGTH = 12

const SPECIAL_CHARACTER = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/

export interface PasswordCheck {
  id: string
  label: string
  passed: boolean
}

export interface PasswordRuleLabels {
  length: string
  uppercase: string
  lowercase: string
  number: string
  special: string
}

export function usePasswordRuleLabels(): PasswordRuleLabels {
  const t = useTranslations('auth')
  return {
    length: t('passwordRules.length'),
    uppercase: t('passwordRules.uppercase'),
    lowercase: t('passwordRules.lowercase'),
    number: t('passwordRules.number'),
    special: t('passwordRules.special')
  }
}

/** Evaluates the password rules; `specialCharacter` decides what counts as a special character. */
export function passwordRuleChecks(
  password: string,
  labels: PasswordRuleLabels,
  specialCharacter: RegExp = SPECIAL_CHARACTER
): PasswordCheck[] {
  return [
    {
      id: 'length',
      label: labels.length,
      passed: password.length >= PASSWORD_MIN_LENGTH
    },
    { id: 'uppercase', label: labels.uppercase, passed: /[A-Z]/.test(password) },
    { id: 'lowercase', label: labels.lowercase, passed: /[a-z]/.test(password) },
    { id: 'number', label: labels.number, passed: /\d/.test(password) },
    {
      id: 'special',
      label: labels.special,
      passed: specialCharacter.test(password)
    }
  ]
}
