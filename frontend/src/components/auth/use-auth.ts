'use client'

import { authClient } from '@/lib/auth'
import { useSyncExternalStore } from 'react'

export function useAuth() {
  return useSyncExternalStore(
    authClient.subscribe,
    authClient.getSnapshot,
    authClient.getServerSnapshot
  )
}
