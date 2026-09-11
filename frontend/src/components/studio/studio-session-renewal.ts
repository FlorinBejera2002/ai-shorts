type Schedule = (callback: () => void, delay: number) => () => void

const scheduleTimer: Schedule = (callback, delay) => {
  const timer = setTimeout(callback, delay)
  return () => clearTimeout(timer)
}

/** Sequential renewal keeps long editing sessions alive without touching editor state. */
export function startStudioSessionRenewal(
  renew: (signal: AbortSignal) => Promise<void>,
  onFailure: (error: unknown) => void,
  schedule: Schedule = scheduleTimer,
  intervalMs = 4 * 60 * 1000
) {
  let stopped = false
  let current: AbortController | null = null
  let cancelTimer: (() => void) | undefined

  async function renewNow() {
    if (stopped || current) return
    cancelTimer?.()
    const controller = new AbortController()
    current = controller
    try {
      await renew(controller.signal)
    } catch (error) {
      if (!stopped && !controller.signal.aborted) onFailure(error)
    } finally {
      current = null
      if (!stopped)
        cancelTimer = schedule(() => {
          void renewNow()
        }, intervalMs)
    }
  }

  cancelTimer = schedule(() => {
    void renewNow()
  }, intervalMs)
  return {
    renewNow,
    stop() {
      stopped = true
      cancelTimer?.()
      current?.abort()
    }
  }
}
