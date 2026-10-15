type Save = () => Promise<void>
const clients = new Map<string, Save>()
const channelName = 'sneepcut:studio-save-barrier'
const presencePrefix = `${channelName}:client:`
const lockManager = () => typeof navigator === 'undefined' ? undefined : navigator.locks

export function registerStudioSave(save: Save) {
  const client = crypto.randomUUID()
  clients.set(client, save)
  const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(channelName)
  let closed = false
  let release = () => {}
  const lifetime = new Promise<void>((resolve) => { release = resolve })
  // The browser releases this presence lock on tab termination, including crashes.
  // Querying it discovers throttled tabs without depending on a message deadline.
  const presence = lockManager()?.request(`${presencePrefix}${client}`, () => lifetime)
  void presence?.catch(() => {})
  if (channel) channel.onmessage = (event) => {
    if (event.data?.type !== 'flush' || typeof event.data.id !== 'string' ||
        !Array.isArray(event.data.clients) || !event.data.clients.includes(client)) return
    const id = event.data.id
    void Promise.resolve().then(save).then(
      () => { if (!closed) channel.postMessage({ type: 'saved', id, client }) },
      () => { if (!closed) channel.postMessage({ type: 'failed', id, client }) }
    )
  }
  return () => { closed = true; clients.delete(client); release(); channel?.close() }
}

/** Synchronize mounted Studio editors, including dashboard tabs sharing this origin. */
export async function flushStudioSaves() {
  const locks = lockManager()
  if (!locks || typeof BroadcastChannel === 'undefined') {
    // Without cross-tab discovery only this mounted page can confirm pending work.
    // Other sessions still have server-side revision protection and blur flushing.
    await Promise.all([...clients.values()].map((save) => save()))
    return
  }
  const snapshot = await locks.query()
  const expected = new Set([...(snapshot.held ?? []), ...(snapshot.pending ?? [])]
    .flatMap((lock) => lock.name?.startsWith(presencePrefix) ? [lock.name.slice(presencePrefix.length)] : [])
    .filter((id) => !clients.has(id)))
  const local = Promise.all([...clients.values()].map((save) => save()))
  const remote = new Promise<void>((resolve, reject) => {
    if (expected.size === 0) { resolve(); return }
    const channel = new BroadcastChannel(channelName)
    const id = crypto.randomUUID()
    let settled = false
    const finish = (error?: Error) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      channel.close()
      if (error) reject(error)
      else resolve()
    }
    const timeout = setTimeout(() => finish(new Error('Studio is still saving. Wait for saving to finish and try again.')), 15000)
    channel.onmessage = (event) => {
      if (event.data?.id !== id || !expected.has(event.data.client)) return
      if (event.data.type === 'saved') { expected.delete(event.data.client); if (!expected.size) finish() }
      if (event.data.type === 'failed') finish(new Error('Save your pending Studio edits before regenerating.'))
    }
    channel.postMessage({ type: 'flush', id, clients: [...expected] })
  })
  await Promise.all([local, remote])
}

export function needsStudioSaveBarrier(path: string, method = 'GET') {
  return method.toUpperCase() === 'POST' && (
    /^\/api\/stories\/[^/]+\/(generate|retry|transcript-review|rollback)$/.test(path) ||
    /^\/api\/clips\/[^/]+\/(trim|recut|style|transitions)$/.test(path) ||
    /^\/api\/workspace-agent\/runs(?:\/[^/]+\/control)?$/.test(path)
  )
}

export function flushStudioFrame(frame: Window, origin: string, projectId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const requestId = crypto.randomUUID()
    const finish = (error?: Error) => {
      clearTimeout(timeout)
      window.removeEventListener('message', receive)
      if (error) reject(error)
      else resolve()
    }
    const receive = (event: MessageEvent) => {
      if (event.source !== frame || event.origin !== origin || event.data?.type !== 'sneepcut:project-flushed' ||
          event.data.projectId !== projectId || event.data.requestId !== requestId) return
      finish(event.data.error ? new Error('Save your pending Studio edits before regenerating.') : undefined)
    }
    const timeout = setTimeout(() => finish(new Error('Studio did not confirm saving. Reconnect to Studio before regenerating.')), 12000)
    window.addEventListener('message', receive)
    frame.postMessage({ type: 'sneepcut:flush-project', projectId, requestId }, origin)
  })
}
