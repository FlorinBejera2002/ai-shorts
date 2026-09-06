export const DISPLAY_NAME_MIN_LENGTH = 2
export const DISPLAY_NAME_MAX_LENGTH = 80
export const PASSWORD_MIN_LENGTH = 12
export const PASSWORD_MAX_LENGTH = 128
export const BCRYPT_MAX_PASSWORD_BYTES = 72

export type ValidationIssue = {
  field: string
  message: string
}

type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; issues: ValidationIssue[] }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function rejectUnknownFields(
  value: Record<string, unknown>,
  allowed: readonly string[],
  issues: ValidationIssue[]
) {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key))
  if (unknown.length > 0) {
    issues.push({
      field: 'body',
      message: `Unsupported field${unknown.length === 1 ? '' : 's'}: ${unknown.join(', ')}`
    })
  }
}

export function normalizeDisplayName(value: string) {
  return value.trim().replace(/\s+/g, ' ')
}

export function validateProfilePayload(
  value: unknown
): ValidationResult<{ name: string }> {
  if (!isRecord(value)) {
    return {
      success: false,
      issues: [{ field: 'body', message: 'Request body must be an object' }]
    }
  }

  const issues: ValidationIssue[] = []
  rejectUnknownFields(value, ['name'], issues)
  const name =
    typeof value.name === 'string' ? normalizeDisplayName(value.name) : ''

  if (name.length < DISPLAY_NAME_MIN_LENGTH) {
    issues.push({
      field: 'name',
      message: `Name must be at least ${DISPLAY_NAME_MIN_LENGTH} characters`
    })
  } else if (name.length > DISPLAY_NAME_MAX_LENGTH) {
    issues.push({
      field: 'name',
      message: `Name must be ${DISPLAY_NAME_MAX_LENGTH} characters or fewer`
    })
  }

  return issues.length > 0
    ? { success: false, issues }
    : { success: true, data: { name } }
}

export function passwordPolicyIssues(password: string): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  if (password.length < PASSWORD_MIN_LENGTH) {
    issues.push({
      field: 'newPassword',
      message: `Password must be at least ${PASSWORD_MIN_LENGTH} characters`
    })
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    issues.push({
      field: 'newPassword',
      message: `Password must be ${PASSWORD_MAX_LENGTH} characters or fewer`
    })
  }
  if (!fitsBcryptPasswordLimit(password)) {
    issues.push({
      field: 'newPassword',
      message: `Password must be ${BCRYPT_MAX_PASSWORD_BYTES} UTF-8 bytes or fewer`
    })
  }
  if (!/[A-Z]/.test(password)) {
    issues.push({
      field: 'newPassword',
      message: 'Password must contain an uppercase letter'
    })
  }
  if (!/[a-z]/.test(password)) {
    issues.push({
      field: 'newPassword',
      message: 'Password must contain a lowercase letter'
    })
  }
  if (!/\d/.test(password)) {
    issues.push({
      field: 'newPassword',
      message: 'Password must contain a digit'
    })
  }
  if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) {
    issues.push({
      field: 'newPassword',
      message: 'Password must contain a special character'
    })
  }
  return issues
}

export function fitsBcryptPasswordLimit(password: string) {
  return (
    new TextEncoder().encode(password).byteLength <= BCRYPT_MAX_PASSWORD_BYTES
  )
}

export function validatePasswordPayload(value: unknown): ValidationResult<{
  currentPassword: string
  newPassword: string
}> {
  if (!isRecord(value)) {
    return {
      success: false,
      issues: [{ field: 'body', message: 'Request body must be an object' }]
    }
  }

  const issues: ValidationIssue[] = []
  rejectUnknownFields(
    value,
    ['currentPassword', 'newPassword', 'confirmPassword'],
    issues
  )
  const currentPassword =
    typeof value.currentPassword === 'string' ? value.currentPassword : ''
  const newPassword =
    typeof value.newPassword === 'string' ? value.newPassword : ''
  const confirmPassword =
    typeof value.confirmPassword === 'string' ? value.confirmPassword : ''

  if (!currentPassword) {
    issues.push({
      field: 'currentPassword',
      message: 'Current password is required'
    })
  } else if (
    currentPassword.length > PASSWORD_MAX_LENGTH ||
    !fitsBcryptPasswordLimit(currentPassword)
  ) {
    issues.push({
      field: 'currentPassword',
      message: `Current password must fit within the secure password length limit`
    })
  }
  issues.push(...passwordPolicyIssues(newPassword))
  if (newPassword && newPassword === currentPassword) {
    issues.push({
      field: 'newPassword',
      message: 'New password must be different from the current password'
    })
  }
  if (newPassword !== confirmPassword) {
    issues.push({
      field: 'confirmPassword',
      message: 'Password confirmation does not match'
    })
  }

  return issues.length > 0
    ? { success: false, issues }
    : { success: true, data: { currentPassword, newPassword } }
}

export function validateAccountDeletionPayload(
  value: unknown,
  expectedEmail: string,
  requireCurrentPassword = false
): ValidationResult<{ confirmation: string; currentPassword: string | null }> {
  if (!isRecord(value)) {
    return {
      success: false,
      issues: [{ field: 'body', message: 'Request body must be an object' }]
    }
  }

  const issues: ValidationIssue[] = []
  rejectUnknownFields(
    value,
    requireCurrentPassword
      ? ['confirmation', 'currentPassword']
      : ['confirmation'],
    issues
  )
  const confirmation =
    typeof value.confirmation === 'string' ? value.confirmation.trim() : ''
  if (
    confirmation.toLocaleLowerCase('en-US') !==
    expectedEmail.toLocaleLowerCase('en-US')
  ) {
    issues.push({
      field: 'confirmation',
      message: 'Confirmation must match the account email address'
    })
  }

  const currentPassword =
    typeof value.currentPassword === 'string' ? value.currentPassword : ''
  if (requireCurrentPassword && !currentPassword) {
    issues.push({
      field: 'currentPassword',
      message: 'Current password is required'
    })
  } else if (
    currentPassword.length > PASSWORD_MAX_LENGTH ||
    !fitsBcryptPasswordLimit(currentPassword)
  ) {
    issues.push({
      field: 'currentPassword',
      message: `Current password must fit within the secure password length limit`
    })
  }

  return issues.length > 0
    ? { success: false, issues }
    : {
        success: true,
        data: {
          confirmation,
          currentPassword: requireCurrentPassword ? currentPassword : null
        }
      }
}
