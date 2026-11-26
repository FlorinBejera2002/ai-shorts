import { apiFetch } from '@/lib/auth'

type LinkOutcome = { kind: 'queued'; id: string } | { kind: 'limit' | 'rateLimited' | 'failed' }

/** Keep transport failures and response validation outside the form's state hook. */
export async function requestYouTubeLink(body: unknown): Promise<LinkOutcome> {
  try {
    const response = await apiFetch('/api/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    if (response.status === 402) return { kind: 'limit' }
    if (response.status === 429) return { kind: 'rateLimited' }
    const data: unknown = await response.json().catch(() => null)
    const id = typeof data === 'object' && data !== null && 'id' in data ? data.id : null
    if (
      !response.ok ||
      typeof id !== 'string' ||
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id)
    )
      return { kind: 'failed' }
    return { kind: 'queued', id }
  } catch {
    return { kind: 'failed' }
  }
}
