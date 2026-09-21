import { useAuthStore } from '../../stores/auth-store'

export function useAuth() {
  const status = useAuthStore((state) => state.status)
  const user = useAuthStore((state) => state.user)
  const error = useAuthStore((state) => state.error)

  return { status, user, error }
}
