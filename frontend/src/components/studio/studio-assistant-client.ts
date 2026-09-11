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
      throw new Error(
        'The document changed. Generate a new proposal before applying.'
      )
    if (response.status === 503)
      throw new Error(
        'The AI service is unavailable. Your project has not been changed.'
      )
    if (!response.ok)
      throw new Error(
        `Studio request failed (${response.status}). Your proposal was not applied.`
      )
    return response
  }
  return {
    async propose(
      message: string,
      signal?: AbortSignal
    ): Promise<StudioProposal> {
      const source = await (
        await request('files/index.html', { signal })
      ).json()
      if (
        typeof source?.content !== 'string' ||
        typeof source?.version !== 'string'
      )
        throw new Error('Could not read the current document version.')
      const result = await (
        await request('assistant', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message, html: source.content }),
          signal
        })
      ).json()
      if (
        typeof result?.html !== 'string' ||
        typeof result?.summary !== 'string'
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
        signal
      })
    }
  }
}
