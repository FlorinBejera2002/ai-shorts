'use client'

import { useEffect, useState } from 'react'

/** Whole seconds since `key` last changed, ticking once a second while `active`. */
export function useSecondsSince(key: string, active: boolean) {
  const [start, setStart] = useState({ key, at: Date.now() })
  const [now, setNow] = useState(start.at)
  if (start.key !== key) {
    const at = Date.now()
    setStart({ key, at })
    setNow(at)
  }

  useEffect(() => {
    if (!active) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [active])

  return Math.max(0, Math.floor((now - start.at) / 1000))
}
