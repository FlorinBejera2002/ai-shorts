import { createHmac, timingSafeEqual } from 'node:crypto'

const DEFAULT_EXPIRY = 4 * 60 * 60 // 4 hours

function normalizeMediaPath(filePath: string): string {
  const mediaRoot = '/app/media'
  let relative = filePath.trim().replace(/\\/g, '/')
  if (relative.startsWith(mediaRoot)) {
    relative = relative.slice(mediaRoot.length)
  } else if (relative.startsWith('/media/')) {
    relative = relative.slice('/media'.length)
  }

  const segments = relative.split('/').filter(Boolean)
  if (
    segments.length === 0 ||
    segments.some(
      (segment) =>
        segment === '.' ||
        segment === '..' ||
        segment.includes('?') ||
        segment.includes('#') ||
        [...segment].some((character) => {
          const codePoint = character.codePointAt(0) ?? 0
          return codePoint < 32 || codePoint === 127
        })
    )
  ) {
    throw new Error('Invalid media path')
  }
  return `/media/${segments.join('/')}`
}

function signingKey(): string {
  const key = process.env.INTERNAL_API_KEY || process.env.AUTH_SECRET
  if (!key && process.env.NODE_ENV === 'production') {
    throw new Error(
      'INTERNAL_API_KEY or AUTH_SECRET is required to sign media URLs'
    )
  }
  return key || 'sneepcut-dev-key'
}

export function signMediaUrl(
  filePath: string,
  expiresIn = DEFAULT_EXPIRY
): string {
  const mediaPath = normalizeMediaPath(filePath)
  const expires = Math.floor(Date.now() / 1000) + expiresIn
  const message = `${mediaPath}:${expires}`
  const sig = createHmac('sha256', signingKey())
    .update(message)
    .digest('hex')
    .slice(0, 32)

  return `${mediaPath}?expires=${expires}&sig=${sig}`
}

export function verifyMediaSignature(
  path: string,
  expires: string,
  sig: string
): boolean {
  const exp = Number.parseInt(expires, 10)
  if (Number.isNaN(exp) || Date.now() / 1000 > exp) return false

  const message = `${path}:${exp}`
  const expected = createHmac('sha256', signingKey())
    .update(message)
    .digest('hex')
    .slice(0, 32)

  try {
    return timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
  } catch {
    return false
  }
}

function localMediaPath(storedUrl: string): string | null {
  if (storedUrl.startsWith('/media/')) {
    return storedUrl.split('?', 1)[0] ?? null
  }

  if (!/^https:\/\//i.test(storedUrl)) return null
  try {
    const url = new URL(storedUrl)
    return url.pathname.startsWith('/media/') &&
      url.searchParams.has('expires') &&
      url.searchParams.has('sig')
      ? url.pathname
      : null
  } catch {
    return null
  }
}

export function resolveMediaUrl(
  filePath: string | null | undefined,
  storedUrl: string | null | undefined
): string | null {
  const storedLocalPath = storedUrl ? localMediaPath(storedUrl) : null
  if (storedUrl && /^https:\/\//i.test(storedUrl) && !storedLocalPath) {
    return storedUrl
  }
  if (filePath) {
    try {
      return signMediaUrl(filePath)
    } catch {
      return null
    }
  }

  if (storedLocalPath) {
    try {
      return signMediaUrl(storedLocalPath)
    } catch {
      return null
    }
  }
  return null
}
