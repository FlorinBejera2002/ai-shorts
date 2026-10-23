/** All hosted billing actions share one synchronous lock, including distinct plan cards. */
export function createBillingActionLock() {
  let pending = false
  const listeners = new Set<() => void>()
  function publish(value: boolean) {
    pending = value
    for (const listener of listeners) listener()
  }
  return {
    getSnapshot: () => pending,
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    acquire() {
      if (pending) return false
      publish(true)
      return true
    },
    release: () => publish(false)
  }
}
