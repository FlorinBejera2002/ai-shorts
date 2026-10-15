import { createStudioClient } from './studio-client'

type BridgeAuth = {
  refresh(): Promise<string | null>
  getAccessToken(): string | null
  getSnapshot(): { user: { id: string } | null }
}

/** Credentials stay on the app origin; only a completion signal crosses frames. */
export function installStudioSessionBridge(
  studioOrigin: string,
  auth: BridgeAuth,
  host: Window = window,
  fetcher: typeof fetch = fetch
) {
  if (host.parent === host) return () => {}
  let pending: AbortController | null = null
  const receive = (event: MessageEvent) => {
    const data: unknown = event.data
    if (
      event.source !== host.parent || event.origin !== studioOrigin ||
      !data || typeof data !== 'object' ||
      !('type' in data) || data.type !== 'sneepcut:renew-session' ||
      !('requestId' in data) || typeof data.requestId !== 'string' ||
      !/^[a-zA-Z0-9-]{1,80}$/.test(data.requestId) ||
      !('userId' in data) || typeof data.userId !== 'string' ||
      !/^[a-f0-9-]{36}$/i.test(data.userId) || pending
    ) return
    const { requestId, userId } = data
    const controller = new AbortController()
    pending = controller
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(30000)])
    const sameAccount = () => auth.getSnapshot().user?.id === userId
    const refresh = async () => {
      const token = await auth.refresh()
      if (!token || !sameAccount()) throw new Error('Sign in to the original account to continue.')
      return token
    }
    const client = createStudioClient(studioOrigin, {
      getAccessToken: () => sameAccount() ? auth.getAccessToken() : null,
      refresh
    }, fetcher)
    const reply = (ok: boolean) => {
      if (!controller.signal.aborted)
        host.parent.postMessage({ type: 'sneepcut:session-result', requestId, ok }, studioOrigin)
    }
    void refresh().then(() => {
      if (signal.aborted) throw new Error('Session renewal was cancelled.')
      return client.connect(signal)
    }).then(() => reply(true), () => reply(false)).finally(() => {
      if (pending === controller) pending = null
    })
  }
  host.addEventListener('message', receive)
  host.parent.postMessage({ type: 'sneepcut:session-bridge-ready' }, studioOrigin)
  return () => {
    host.removeEventListener('message', receive)
    pending?.abort()
  }
}
