export function configuredStudioOrigin(
  value: string | undefined,
  production: boolean
): string | null {
  const configured = value?.trim()
  if (!configured) return production ? null : 'http://localhost:5191'
  if (production) {
    try {
      const url = new URL(configured)
      if (
        url.protocol !== 'https:' ||
        url.hostname === 'localhost' ||
        url.hostname.endsWith('.localhost') ||
        url.hostname.startsWith('127.') ||
        url.hostname === '[::1]'
      )
        return null
    } catch {
      return null
    }
  }
  return configured
}
