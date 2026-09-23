export function configuredStudioOrigin(
  value: string | undefined,
  production: boolean
): string | null {
  const configured = value?.trim()
  if (!configured) return production ? null : 'http://localhost:5191'
  try {
    const url = new URL(configured)
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    if (
      (url.protocol !== 'https:' && !(local && !production && url.protocol === 'http:')) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== '/' ||
      (production &&
        (local || url.hostname.endsWith('.localhost') || url.hostname.startsWith('127.')))
    )
      return null
    return url.origin
  } catch {
    return null
  }
}
