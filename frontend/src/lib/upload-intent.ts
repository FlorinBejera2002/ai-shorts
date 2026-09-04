import { createHmac, randomUUID } from 'node:crypto'

export const MAX_UPLOAD_BYTES = 2 * 1024 ** 3
export const UPLOAD_TOKEN_TTL_SECONDS = 5 * 60

const CONTENT_TYPES = new Set([
  'application/octet-stream',
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'video/x-matroska',
  'video/x-msvideo'
])
const FILE_EXTENSION = /\.(mp4|mov|avi|mkv|webm)$/i

function containsControlCharacter(value: string) {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0
    return codePoint < 32 || codePoint === 127
  })
}

export type UploadIntent = {
  fileName: string
  fileSize: number
  contentType: string
}

export type SignedUploadIntent = UploadIntent & {
  version: 1
  userId: string
  nonce: string
  expiresAt: number
}

export function validateUploadIntent(
  value: unknown
): { success: true; data: UploadIntent } | { success: false; error: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { success: false, error: 'Request body must be an object' }
  }
  const record = value as Record<string, unknown>
  const allowed = new Set(['fileName', 'fileSize', 'contentType'])
  if (Object.keys(record).some((key) => !allowed.has(key))) {
    return { success: false, error: 'Request body contains unsupported fields' }
  }

  if (typeof record.fileName !== 'string') {
    return { success: false, error: 'File name is required' }
  }
  const fileName = record.fileName.trim()
  if (
    !fileName ||
    fileName !== record.fileName ||
    fileName.length > 255 ||
    containsControlCharacter(fileName) ||
    !FILE_EXTENSION.test(fileName)
  ) {
    return { success: false, error: 'Unsupported file name' }
  }
  if (
    typeof record.fileSize !== 'number' ||
    !Number.isSafeInteger(record.fileSize) ||
    record.fileSize < 1 ||
    record.fileSize > MAX_UPLOAD_BYTES
  ) {
    return { success: false, error: 'File size is outside the supported range' }
  }
  if (
    typeof record.contentType !== 'string' ||
    !CONTENT_TYPES.has(record.contentType)
  ) {
    return { success: false, error: 'Unsupported content type' }
  }

  return {
    success: true,
    data: {
      fileName,
      fileSize: record.fileSize,
      contentType: record.contentType
    }
  }
}

export function signUploadIntent({
  intent,
  userId,
  secret,
  now = Date.now()
}: {
  intent: UploadIntent
  userId: string
  secret: string
  now?: number
}) {
  const payload: SignedUploadIntent = {
    version: 1,
    userId,
    nonce: randomUUID().replace(/-/g, ''),
    expiresAt: Math.floor(now / 1000) + UPLOAD_TOKEN_TTL_SECONDS,
    ...intent
  }
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
    'base64url'
  )
  const signature = createHmac('sha256', secret)
    .update(encodedPayload)
    .digest('base64url')
  return `${encodedPayload}.${signature}`
}

export function getDirectUploadUrl(environment = process.env) {
  const configured = environment.NEXT_PUBLIC_UPLOAD_URL?.trim()
  if (!configured) return null

  let url: URL
  try {
    url = new URL(configured)
  } catch {
    throw new Error('NEXT_PUBLIC_UPLOAD_URL must be a valid URL')
  }
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/api/upload/direct' ||
    ((environment.APP_ENV === 'production' ||
      environment.NODE_ENV === 'production') &&
      url.protocol !== 'https:')
  ) {
    throw new Error(
      'NEXT_PUBLIC_UPLOAD_URL must be a secure /api/upload/direct endpoint'
    )
  }
  return url.toString()
}
