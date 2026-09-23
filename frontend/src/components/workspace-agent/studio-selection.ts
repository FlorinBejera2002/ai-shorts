import { useSyncExternalStore } from 'react'

type Selection = { projectId: string; ids: string[] }
let current: Selection | null = null
const listeners = new Set<() => void>()
export function publishStudioSelection(projectId: string, ids: unknown) {
  if (!Array.isArray(ids) || ids.length > 20 || ids.some(id => typeof id !== 'string' || !id || id.length > 200 || [...id].some(char => char.charCodeAt(0) < 32))) return
  current = { projectId, ids: [...new Set(ids as string[])] }
  listeners.forEach(listener => listener())
}
export function clearStudioSelection(projectId: string) {
  if (current?.projectId !== projectId) return
  current = null; listeners.forEach(listener => listener())
}
export function useStudioSelection() { return useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener) } }, () => current, () => null) }
