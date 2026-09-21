import type { AuthSnapshot, AuthUser } from '@/lib/auth-client'
import { create } from 'zustand'

export interface AuthStoreState extends AuthSnapshot {
  accessToken: string | null
}

export const useAuthStore = create<AuthStoreState>()(() => ({
  status: 'loading',
  user: null,
  error: null,
  accessToken: null
}))

export function publishAuthState(
  snapshot: AuthSnapshot,
  accessToken: string | null
) {
  useAuthStore.setState({ ...snapshot, accessToken })
}

export type { AuthUser }
