type Environment = Record<string, string | undefined>

export function passwordResetDelivery(environment: Environment = process.env) {
  const apiKey = environment.RESEND_API_KEY?.trim()
  const from = environment.AUTH_EMAIL_FROM?.trim()
  const origin = environment.NEXTAUTH_URL?.trim()
  if (!apiKey || !from || !origin) return null
  try {
    const url = new URL(origin)
    if (url.protocol !== 'https:' || url.username || url.password) return null
    return { apiKey, from, origin: url.origin }
  } catch {
    return null
  }
}

export async function sendPasswordResetEmail(
  delivery: NonNullable<ReturnType<typeof passwordResetDelivery>>,
  email: string,
  token: string,
  tokenDigest: string,
  send: typeof fetch = fetch
) {
  const link = new URL('/reset-password', delivery.origin)
  link.searchParams.set('token', token)
  link.searchParams.set('email', email)
  const response = await send('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${delivery.apiKey}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': `password-reset/${tokenDigest}`
    },
    signal: AbortSignal.timeout(10000),
    body: JSON.stringify({
      from: delivery.from,
      to: [email],
      subject: 'Reset your Sneepcut password',
      text: `Use this link to reset your Sneepcut password:\n\n${link}\n\nThis link expires in one hour. If you did not request this, you can ignore this email.`
    })
  })
  if (!response.ok) throw new Error('Password reset delivery failed')
  const result: unknown = await response.json()
  if (
    !result ||
    typeof result !== 'object' ||
    !('id' in result) ||
    typeof result.id !== 'string' ||
    !result.id
  ) {
    throw new Error('Password reset delivery was not acknowledged')
  }
}
