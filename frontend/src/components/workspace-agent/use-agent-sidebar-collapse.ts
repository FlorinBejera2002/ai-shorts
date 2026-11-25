'use client'

import { useEffect, useRef } from 'react'
import { useSidebar } from '@/components/ui/sidebar'

/**
 * While the desktop agent panel is open, the dashboard sidebar collapses to its icon rail.
 * Closing the panel restores the sidebar state it had when the panel opened. Changes the user
 * makes to the sidebar while the panel is open are kept; the sidebar is not collapsed again.
 */
export function useAgentSidebarCollapse(agentOpen: boolean, enabled: boolean) {
  const { open: sidebarOpen, setOpen: setSidebarOpen } = useSidebar()
  const sidebarOpenRef = useRef(sidebarOpen)
  const sidebarBeforeAgent = useRef<boolean | null>(null)

  // Read by the transition effect below without making the sidebar state a dependency of it.
  useEffect(() => {
    sidebarOpenRef.current = sidebarOpen
  }, [sidebarOpen])

  useEffect(() => {
    if (!enabled) return
    if (agentOpen) {
      if (sidebarBeforeAgent.current !== null) return
      sidebarBeforeAgent.current = sidebarOpenRef.current
      if (sidebarOpenRef.current) setSidebarOpen(false)
    } else if (sidebarBeforeAgent.current !== null) {
      setSidebarOpen(sidebarBeforeAgent.current)
      sidebarBeforeAgent.current = null
    }
  }, [agentOpen, enabled, setSidebarOpen])
}
