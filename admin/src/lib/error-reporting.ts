import { apiOrigin } from '../api'

/**
 * Sends uncaught console errors to POST /api/errors (source "admin"), at most a
 * few per page load and one per distinct message. Mirrors frontend/src/lib/error-reporting.ts.
 */
const maxReports = 10
const reported = new Set<string>()

function describe(error: unknown) {
  if (error instanceof Error) return { message: `${error.name}: ${error.message}`, stack: error.stack ?? '' }
  return { message: typeof error === 'string' ? error : String(error), stack: '' }
}

export function reportClientError(error: unknown) {
  const { message, stack } = describe(error)
  if (!message || reported.has(message) || reported.size >= maxReports) return
  reported.add(message)
  const body = JSON.stringify({ source: 'admin', message: message.slice(0, 500), stack: stack.slice(0, 4000), page: window.location.pathname })
  void fetch(`${apiOrigin}/api/errors`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true, credentials: 'omit' }).catch(() => undefined)
}

export function installErrorReporting() {
  window.addEventListener('error', (event) => {
    if (event.error || event.message) reportClientError(event.error ?? event.message)
  })
  window.addEventListener('unhandledrejection', (event) => reportClientError(event.reason))
}
