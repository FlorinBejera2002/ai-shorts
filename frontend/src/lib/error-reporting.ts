/**
 * Sends uncaught browser errors to POST /api/errors so they appear in the admin
 * console's error log. Best effort: at most a few reports per page load, one
 * per distinct message, the page URL without its query string, and only errors
 * raised by this app (see isReportableError).
 */
import { isReportableError } from './error-report-filter'

const endpoint = `${(import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')}/api/errors`
const maxReports = 10
// The bundle's own origin, so frames from a CDN-hosted build still count as app frames.
const appOrigin = new URL(import.meta.url).origin
const reported = new Set<string>()

function describe(error: unknown): { message: string; stack: string } {
  if (error instanceof Error) return { message: `${error.name}: ${error.message}`, stack: error.stack ?? '' }
  if (typeof error === 'string') return { message: error, stack: '' }
  try { return { message: JSON.stringify(error) ?? String(error), stack: '' } } catch { return { message: String(error), stack: '' } }
}

export function reportClientError(error: unknown) {
  const { message, stack } = describe(error)
  if (!message || reported.has(message) || reported.size >= maxReports) return
  if (!isReportableError(message, stack, appOrigin)) return
  reported.add(message)
  const body = JSON.stringify({ source: 'web', message: message.slice(0, 500), stack: stack.slice(0, 4000), page: window.location.pathname })
  void fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true, credentials: 'omit' }).catch(() => undefined)
}

export function installErrorReporting() {
  window.addEventListener('error', (event) => {
    // Resource load failures (images, scripts) have no error object and are not app crashes.
    if (event.error || event.message) reportClientError(event.error ?? event.message)
  })
  window.addEventListener('unhandledrejection', (event) => reportClientError(event.reason))
}
