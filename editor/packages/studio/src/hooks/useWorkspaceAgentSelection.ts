import { useEffect } from 'react'
import { usePlayerStore } from '../player'

// Only the embedding page that sent the handshake receives selection metadata.
export function useWorkspaceAgentSelection(projectId: string | null | undefined) {
  useEffect(() => {
    if (!projectId || window.parent === window) return
    let parentOrigin: string
    try { parentOrigin = new URL(document.referrer).origin } catch { return }
    let connected = false
    function send() {
      if (!connected) return
      window.parent.postMessage({ type: 'sneepcut:agent-selection', projectId, ids: [...usePlayerStore.getState().selectedElementIds].slice(0, 20) }, parentOrigin)
    }
    function receive(event: MessageEvent) {
      if (event.source !== window.parent || event.origin !== parentOrigin || event.data?.type !== 'sneepcut:agent-selection-connect' || event.data.projectId !== projectId) return
      connected = true; send()
    }
    window.addEventListener('message', receive)
    window.parent.postMessage({ type: 'sneepcut:agent-selection-ready', projectId }, parentOrigin)
    const unsubscribe = usePlayerStore.subscribe((state, previous) => { if (state.selectedElementIds !== previous.selectedElementIds) send() })
    return () => { window.removeEventListener('message', receive); unsubscribe() }
  }, [projectId])
}
