'use client'

import { useEffect, useRef } from 'react'

export interface EditorShortcutHandlers {
  onTogglePlay: () => void
  onSeekBy: (delta: number) => void
  onSplit: () => void
  onDeleteSelected: () => void
  onSetStartAtPlayhead: () => void
  onSetEndAtPlayhead: () => void
  onUndo: () => void
  onRedo: () => void
  onZoom: (direction: 1 | -1) => void
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    target.isContentEditable
  )
}

export function useEditorShortcuts(handlers: EditorShortcutHandlers) {
  const handlersRef = useRef(handlers)
  handlersRef.current = handlers

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return
      const h = handlersRef.current
      const ctrl = e.ctrlKey || e.metaKey

      if (ctrl && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) {
          h.onRedo()
        } else {
          h.onUndo()
        }
        return
      }
      if (ctrl && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        h.onRedo()
        return
      }
      if (ctrl) return

      switch (e.key) {
        case ' ':
          e.preventDefault()
          h.onTogglePlay()
          break
        case 'ArrowLeft':
          e.preventDefault()
          h.onSeekBy(e.shiftKey ? -5 : -1)
          break
        case 'ArrowRight':
          e.preventDefault()
          h.onSeekBy(e.shiftKey ? 5 : 1)
          break
        case ',':
          h.onSeekBy(-0.1)
          break
        case '.':
          h.onSeekBy(0.1)
          break
        case 's':
        case 'S':
          h.onSplit()
          break
        case 'Delete':
        case 'Backspace':
          e.preventDefault()
          h.onDeleteSelected()
          break
        case '[':
          h.onSetStartAtPlayhead()
          break
        case ']':
          h.onSetEndAtPlayhead()
          break
        case '+':
        case '=':
          h.onZoom(1)
          break
        case '-':
        case '_':
          h.onZoom(-1)
          break
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
