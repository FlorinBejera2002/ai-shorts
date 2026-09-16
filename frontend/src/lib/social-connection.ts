import {
  PUBLISHING_PROVIDER_CATALOG,
  type PublishingProvider
} from './publishing'

const POPUP_REQUEST_KEY = 'sneepcut:social-connection-request'
const CHANNEL_PREFIX = 'sneepcut:social-connection:'
const REQUEST_LIFETIME = 10 * 60 * 1000

export type SocialConnectionResult =
  | { provider: PublishingProvider; error?: never }
  | { error: string; provider?: never }

export function readSocialConnectionResult(
  search: string
): SocialConnectionResult | null {
  const params = new URLSearchParams(search)
  if (params.has('connectionError')) {
    return { error: params.get('connectionError') || 'authorization_failed' }
  }
  const provider = PUBLISHING_PROVIDER_CATALOG.find(
    ({ id }) => id === params.get('connected')
  )
  return provider ? { provider: provider.id } : null
}

function isResult(value: unknown): value is SocialConnectionResult {
  if (typeof value !== 'object' || value === null) return false
  if ('error' in value) return typeof value.error === 'string'
  return (
    'provider' in value &&
    PUBLISHING_PROVIDER_CATALOG.some(({ id }) => id === value.provider)
  )
}

function openChannel(id: string): BroadcastChannel | null {
  try {
    return new BroadcastChannel(`${CHANNEL_PREFIX}${id}`)
  } catch {
    // postMessage still supports browsers where BroadcastChannel is unavailable.
    return null
  }
}

/** Set up the receiver before navigating the popup away from our origin. */
export function listenForSocialConnection(
  popup: Window,
  provider: PublishingProvider,
  onResult: (result: SocialConnectionResult) => void,
  onClosed: () => void
): () => void {
  const id = crypto.randomUUID()
  const channel = openChannel(id)
  let settled = false
  try {
    popup.sessionStorage.setItem(
      POPUP_REQUEST_KEY,
      JSON.stringify({ id, createdAt: Date.now() })
    )
  } catch {
    // The callback can still display its own confirmation if storage is blocked.
  }

  function receive(event: MessageEvent, fromPopup = false) {
    const message = event.data
    if (
      settled ||
      !message ||
      message.id !== id ||
      message.type !== 'result' ||
      !isResult(message.result) ||
      (message.result.provider && message.result.provider !== provider)
    )
      return

    const acknowledgement = { id, type: 'received' }
    channel?.postMessage(acknowledgement)
    if (fromPopup) popup.postMessage(acknowledgement, window.location.origin)
    dispose()
    onResult(message.result)
  }
  function receiveMessage(event: MessageEvent) {
    if (event.origin === window.location.origin && event.source === popup) {
      receive(event, true)
    }
  }
  channel?.addEventListener('message', receive)
  window.addEventListener('message', receiveMessage)
  const closedCheck = window.setInterval(() => {
    if (!popup.closed) return
    window.clearInterval(closedCheck)
    onClosed()
    // COOP may mark the handle closed while OAuth is still open. Keep the
    // independent channel alive until a result, another attempt, or expiry.
  }, 500)
  const expiry = window.setTimeout(() => {
    dispose()
    onClosed()
  }, REQUEST_LIFETIME)

  function dispose() {
    if (settled) return
    settled = true
    channel?.close()
    window.removeEventListener('message', receiveMessage)
    window.clearInterval(closedCheck)
    window.clearTimeout(expiry)
  }
  return dispose
}

/** Relay an actual callback, and keep it visible locally if no tab accepts it. */
export async function completeSocialConnection(): Promise<SocialConnectionResult | null> {
  const result = readSocialConnectionResult(window.location.search)
  if (!result) return null

  let request: { id: string; createdAt: number } | null = null
  try {
    const stored = JSON.parse(
      window.sessionStorage.getItem(POPUP_REQUEST_KEY) ?? 'null'
    )
    if (
      stored &&
      typeof stored.id === 'string' &&
      typeof stored.createdAt === 'number' &&
      Date.now() - stored.createdAt >= 0 &&
      Date.now() - stored.createdAt < REQUEST_LIFETIME
    )
      request = stored
    window.sessionStorage.removeItem(POPUP_REQUEST_KEY)
    // Retire the old intent flag: starting OAuth never proves success.
    window.sessionStorage.removeItem('sneepcut:pending-social-connection')
  } catch {
    request = null
  }

  const url = new URL(window.location.href)
  url.searchParams.delete('connected')
  url.searchParams.delete('connectionError')
  window.history.replaceState(
    window.history.state,
    '',
    `${url.pathname}${url.search}${url.hash}`
  )
  if (!request) return result

  const { id } = request
  const channel = openChannel(id)
  const accepted = await new Promise<boolean>((resolve) => {
    function finish(received: boolean) {
      window.clearTimeout(timeout)
      channel?.close()
      window.removeEventListener('message', receiveMessage)
      resolve(received)
    }
    function receive(event: MessageEvent) {
      if (event.data?.id === id && event.data?.type === 'received') finish(true)
    }
    function receiveMessage(event: MessageEvent) {
      if (
        event.origin === window.location.origin &&
        event.source === window.opener
      )
        receive(event)
    }
    const timeout = window.setTimeout(() => finish(false), 1000)
    channel?.addEventListener('message', receive)
    window.addEventListener('message', receiveMessage)
    const message = { id, type: 'result', result }
    channel?.postMessage(message)
    try {
      window.opener?.postMessage(message, window.location.origin)
    } catch {
      // OAuth isolation can sever window.opener; the channel is independent.
    }
  })
  if (!accepted) return result
  window.close()
  return null
}
