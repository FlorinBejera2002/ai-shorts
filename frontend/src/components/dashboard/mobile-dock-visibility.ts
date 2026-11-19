'use client'

import { useEffect } from 'react'
import { create } from 'zustand'

/**
 * Secondary views that share a main page's route (for example the Scenarii editor on
 * `/dashboard/script-generator`) hide the phone bottom bar, as the canvas shows it only on main
 * pages. Each mounted request counts; the bar returns when the last one goes away.
 */
type DockVisibility = { hiders: number; add: () => void; remove: () => void }

const useDockVisibility = create<DockVisibility>((set) => ({
  hiders: 0,
  add: () => set((state) => ({ hiders: state.hiders + 1 })),
  remove: () => set((state) => ({ hiders: Math.max(0, state.hiders - 1) }))
}))

/** Hide the phone bottom bar while `hidden` is true (e.g. `useHideMobileDock(view === 'editor')`). */
export function useHideMobileDock(hidden: boolean) {
  const add = useDockVisibility((state) => state.add)
  const remove = useDockVisibility((state) => state.remove)
  useEffect(() => {
    if (!hidden) return
    add()
    return remove
  }, [hidden, add, remove])
}

/** True while any secondary view asks the bar to stay hidden. */
export function useDockHiddenByView() {
  return useDockVisibility((state) => state.hiders > 0)
}
