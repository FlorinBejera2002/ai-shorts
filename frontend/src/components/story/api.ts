import { apiFetch, authClient } from '@/lib/auth'
import { extractApiError } from '@/lib/api-error'

export class StoryRequestError extends Error {
  readonly status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
    this.name = 'StoryRequestError'
  }
}
export async function storyRequest<T>(
  path: string,
  method = 'GET',
  body?: unknown,
  signal?: AbortSignal
): Promise<T> {
  const response = await apiFetch(path, {
    method,
    signal,
    ...(body === undefined
      ? {}
      : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new StoryRequestError(extractApiError(data, `Request failed (${response.status})`), response.status)
    if (response.status === 429) Object.assign(error, { retryAfterSeconds: retryDelay(response.headers.get('Retry-After')) })
    throw error
  }
  return data as T
}

export async function uploadNarration(
  file: File,
  signal: AbortSignal
): Promise<string> {
  const form = new FormData()
  form.set('file', file)
  const response = await apiFetch('/api/upload/narration', {
    method: 'POST',
    body: form,
    signal
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok || typeof data.file_path !== 'string')
    throw new Error(extractApiError(data, 'Could not save narration. Try again.'))
  return data.file_path
}

/** Stream the browser's File directly; never materialize a video in JavaScript memory. */
export async function uploadStoryFile(
  file: File,
  signal: AbortSignal,
  onProgress: (bytes: number) => void
): Promise<string> {
  const authorization = await storyRequest<{ uploadUrl: string; token: string | null }>(
    '/api/upload/authorize',
    'POST',
    {
      fileName: file.name,
      fileSize: file.size,
      contentType: file.type || 'application/octet-stream'
    },
    AbortSignal.any([signal, AbortSignal.timeout(15000)])
  )
  signal.throwIfAborted()
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    const direct = Boolean(authorization.token)
    xhr.open(
      direct ? 'PUT' : 'POST',
      direct ? authorization.uploadUrl : authClient.url('/api/upload')
    )
    xhr.withCredentials = true
    xhr.responseType = 'json'
    xhr.timeout = 30 * 60 * 1000
    xhr.setRequestHeader(
      'Authorization',
      `Bearer ${authorization.token ?? authClient.getAccessToken() ?? ''}`
    )
    if (direct)
      xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream')
    const abort = () => xhr.abort()
    const finish = () => signal.removeEventListener('abort', abort)
    signal.addEventListener('abort', abort, { once: true })
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable)
        onProgress(Math.min(file.size, (file.size * event.loaded) / event.total))
    }
    xhr.onload = () => {
      finish()
      if (
        xhr.status >= 200 &&
        xhr.status < 300 &&
        typeof xhr.response?.file_path === 'string'
      ) {
        resolve(xhr.response.file_path)
      } else {
        const error = new Error(extractApiError(xhr.response ?? {}, 'Upload failed'))
        if (xhr.status === 429) Object.assign(error, { retryAfterSeconds: retryDelay(xhr.getResponseHeader('Retry-After')) })
        reject(error)
      }
    }
    xhr.onerror = xhr.ontimeout = () => {
      finish()
      reject(new Error('Upload failed. Check your connection and retry.'))
    }
    xhr.onabort = () => {
      finish()
      reject(new DOMException('Upload cancelled', 'AbortError'))
    }
    if (signal.aborted) {
      finish()
      reject(signal.reason)
      return
    }
    if (direct) xhr.send(file)
    else {
      const form = new FormData()
      form.set('file', file)
      xhr.send(form)
    }
  })
}

function retryDelay(value: string | null) {
 const seconds = Number(value)
 return Number.isFinite(seconds) && seconds > 0 ? Math.min(3600, seconds) : 2
}
