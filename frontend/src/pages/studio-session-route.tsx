import { useEffect } from 'react'
import { authClient } from '@/lib/auth'
import { configuredStudioOrigin } from '@/components/studio/studio-config'
import { installStudioSessionBridge } from '@/components/studio/studio-session-bridge'

const origin = configuredStudioOrigin(
  process.env.NEXT_PUBLIC_STUDIO_URL,
  process.env.NODE_ENV === 'production'
)

/** Authentication transport only; this route never mounts a dashboard or editor. */
export function StudioSessionRoute() {
  useEffect(() => origin ? installStudioSessionBridge(origin, authClient) : undefined, [])
  return null
}
