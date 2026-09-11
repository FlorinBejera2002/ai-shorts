export type StudioProject = { id: string; title: string }

export async function prepareStudioClip(
  client: ReturnType<typeof createStudioClient>,
  clipId: string,
  signal?: AbortSignal
): Promise<string> {
  await client.connect(signal)
  const project = await client.openClip(clipId, signal)
  return `${client.origin}/#project/${encodeURIComponent(project.id)}`
}

type StudioAuth = {
  getAccessToken(): string | null
  refresh(): Promise<string | null>
}

export function studioOrigin(value: string): string {
  const url = new URL(value)
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  if (
    (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/'
  )
    throw new Error(
      'Studio must be configured with a secure origin, without a path or credentials.'
    )
  return url.origin
}

function project(value: unknown): StudioProject {
  if (
    !value ||
    typeof value !== 'object' ||
    !('id' in value) ||
    !('title' in value) ||
    typeof value.id !== 'string' ||
    !/^[a-zA-Z0-9_-]+$/.test(value.id) ||
    typeof value.title !== 'string'
  ) {
    throw new Error('Studio returned an invalid project.')
  }
  return { id: value.id, title: value.title }
}

export function createStudioClient(
  origin: string,
  auth: StudioAuth,
  fetcher: typeof fetch = fetch
) {
  const base = studioOrigin(origin)
  async function request(path: string, init: RequestInit = {}) {
    const response = await fetcher(`${base}/sneepcut/${path}`, {
      ...init,
      credentials: 'include',
      cache: 'no-store',
      redirect: 'error'
    })
    if (!response.ok) {
      if (response.status === 401)
        throw new Error('Studio session expired. Reconnect to continue.')
      const body: unknown = await response.json().catch(() => null)
      throw new Error(
        body &&
          typeof body === 'object' &&
          'error' in body &&
          typeof body.error === 'string'
          ? body.error
          : `Studio request failed (${response.status}). Please try again.`
      )
    }
    return response
  }
  return {
    origin: base,
    async workspace(signal?: AbortSignal): Promise<StudioProject> {
      const data = await (
        await request('workspace', { method: 'POST', signal })
      ).json()
      return project(data.project)
    },
    async openClip(id: string, signal?: AbortSignal): Promise<StudioProject> {
      if (
        !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
          id
        )
      )
        throw new Error('Invalid clip identifier.')
      const data = await (
        await request(`clips/${id}/open`, { method: 'POST', signal })
      ).json()
      return project(data.project)
    },
    async connect(signal?: AbortSignal) {
      let token = auth.getAccessToken() ?? (await auth.refresh())
      if (!token) throw new Error('Sign in to open Studio.')
      const send = (bearer: string) =>
        fetcher(`${base}/sneepcut/session`, {
          method: 'POST',
          credentials: 'include',
          cache: 'no-store',
          redirect: 'error',
          headers: { Authorization: `Bearer ${bearer}` },
          signal
        })
      let response = await send(token)
      if (response.status === 401 && !signal?.aborted) {
        token = await auth.refresh()
        if (token) response = await send(token)
      }
      if (!response.ok)
        throw new Error(
          `Could not connect to Studio (${response.status}). Please try again.`
        )
    },
    async projects(signal?: AbortSignal): Promise<StudioProject[]> {
      const data: unknown = await (await request('projects', { signal })).json()
      if (
        !data ||
        typeof data !== 'object' ||
        !('projects' in data) ||
        !Array.isArray(data.projects)
      ) {
        throw new Error('Studio returned an invalid project list.')
      }
      return data.projects.map(project)
    },
    async create(title: string, signal?: AbortSignal): Promise<StudioProject> {
      const name = title.trim()
      if (!name || name.length > 120)
        throw new Error('Use a project title between 1 and 120 characters.')
      const data: unknown = await (
        await request('projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: name }),
          signal
        })
      ).json()
      return project(
        data && typeof data === 'object' && 'project' in data
          ? data.project
          : null
      )
    },
    async disconnect() {
      await request('session', { method: 'DELETE' })
    }
  }
}
