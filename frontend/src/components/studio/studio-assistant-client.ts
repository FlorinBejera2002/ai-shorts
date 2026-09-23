import { studioOrigin } from './studio-client'

export type StudioProposal = { html: string; summary: string; version: string }

export function createStudioAssistant(
  origin: string,
  projectId: string,
  fetcher: typeof fetch = fetch
) {
  const base = `${studioOrigin(origin)}/api/projects/${encodeURIComponent(projectId)}`
  async function request(path: string, init: RequestInit = {}) {
    const response = await fetcher(`${base}/${path}`, {
      ...init,
      credentials: 'include',
      cache: 'no-store',
      redirect: 'error'
    })
    if (response.status === 409 || response.status === 412)
      throw new Error('The document changed. Generate a new proposal before applying.')
    if (response.status === 503)
      throw new Error('The AI service is unavailable. Your project has not been changed.')
    if (response.status === 401)
      throw new Error('Your Studio session expired. Reconnect to continue.')
    if (!response.ok) {
      const body: unknown = await response.json().catch(() => null)
      throw new Error(
        body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
          ? body.error
          : `Studio request failed (${response.status}). Please try again.`
      )
    }
    return response
  }
  return {
    async propose(message: string, signal?: AbortSignal): Promise<StudioProposal> {
      if (!message.trim() || message.trim().length > 4000)
        throw new Error('Describe your edit using between 1 and 4000 characters.')
      signal = signal
        ? AbortSignal.any([signal, AbortSignal.timeout(120000)])
        : AbortSignal.timeout(120000)
      const source = await (await request('files/index.html', { signal })).json()
      if (typeof source?.content !== 'string' || typeof source?.version !== 'string')
        throw new Error('Could not read the current document version.')
      const result = await (
        await request('assistant', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: message.trim(), html: source.content }),
          signal
        })
      ).json()
      if (
        typeof result?.html !== 'string' ||
        typeof result?.summary !== 'string' ||
        !result.html.trim()
      )
        throw new Error('The AI service returned an invalid proposal.')
      return {
        html: result.html,
        summary: result.summary,
        version: source.version
      }
    },
    async apply(proposal: StudioProposal, signal?: AbortSignal) {
      await request('files/index.html', {
        method: 'PUT',
        headers: { 'Content-Type': 'text/html', 'If-Match': proposal.version },
        body: proposal.html,
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(30000)])
          : AbortSignal.timeout(30000)
      })
    }
  }
}
