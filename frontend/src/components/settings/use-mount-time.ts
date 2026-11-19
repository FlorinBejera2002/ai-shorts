import { useState } from 'react'

/** The time the component mounted, so relative labels stay stable across re-renders. */
export function useMountTime() {
  const [now] = useState(Date.now)
  return now
}
