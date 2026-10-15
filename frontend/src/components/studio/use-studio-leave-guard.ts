import { useEffect, useRef } from 'react'
import { useBlocker } from 'react-router-dom'

/** Keep the editor mounted until its pending writes finish, including browser Back. */
export function useStudioLeaveGuard(enabled: boolean, save: () => Promise<void>, onError: (message: string) => void) {
  const latest = useRef({ save, onError })
  useEffect(() => { latest.current = { save, onError } }, [save, onError])
  const pending = useRef<Promise<void> | null>(null)
  const blocker = useBlocker(enabled)
  useEffect(() => {
    if (blocker.state !== 'blocked') return
    let active = true
    pending.current ??= latest.current.save().finally(() => { pending.current = null })
    void pending.current.then(() => {
      if (active) blocker.proceed()
    }, (error: unknown) => {
      if (!active) return
      latest.current.onError(error instanceof Error ? error.message : 'Studio changes could not be saved. Try again before leaving.')
      blocker.reset()
    })
    return () => { active = false }
  }, [blocker])
}
