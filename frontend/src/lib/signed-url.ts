import { createHmac, timingSafeEqual } from 'node:crypto'

const DEFAULT_EXPIRY = 4 * 60 * 60 // 4 hours

function signingKey(): string {
  return process.env.INTERNAL_API_KEY || process.env.AUTH_SECRET || 'clipforge-dev-key'
}

export function signMediaUrl(filePath: string, expiresIn = DEFAULT_EXPIRY): string {
  const mediaRoot = '/app/media'
  let relative = filePath
  if (relative.startsWith(mediaRoot)) {
    relative = relative.slice(mediaRoot.length)
  }
  if (!relative.startsWith('/')) {
    relative = `/${relative}`
  }

  const mediaPath = `/media${relative}`
  const expires = Math.floor(Date.now() / 1000) + expiresIn
  const message = `${mediaPath}:${expires}`
  const sig = createHmac('sha256', signingKey()).update(message).digest('hex').slice(0, 32)

  return `${mediaPath}?expires=${expires}&sig=${sig}`
}

export function verifyMediaSignature(path: string, expires: string, sig: string): boolean {
  const exp = Number.parseInt(expires, 10)
  if (Number.isNaN(exp) || Date.now() / 1000 > exp) return false

  const message = `${path}:${exp}`
  const expected = createHmac('sha256', signingKey()).update(message).digest('hex').slice(0, 32)

  try {
    return timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
  } catch {
    return false
  }
}
