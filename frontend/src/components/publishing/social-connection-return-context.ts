'use client'

import { createContext } from 'react'

// The OAuth confirmation owns loading feedback until the return is complete.
export const SocialConnectionReturnContext = createContext<{
  returning: boolean
  onPageReady: () => void
}>({
  returning: false,
  onPageReady: () => undefined
})
