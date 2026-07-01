'use client'

import { useReducer, useCallback, useEffect, useRef } from 'react'

export interface Segment {
  start: number
  end: number
  order: number
}

interface EditorState {
  segments: Segment[]
  selectedIndex: number | null
  isDirty: boolean
}

type Action =
  | { type: 'SET_SEGMENTS'; segments: Segment[] }
  | { type: 'ADD_SEGMENT'; start: number; end: number }
  | { type: 'DELETE_SEGMENT'; index: number }
  | { type: 'RESIZE_SEGMENT'; index: number; start: number; end: number }
  | { type: 'MOVE_SEGMENT'; index: number; start: number; end: number }
  | { type: 'REORDER_SEGMENT'; index: number; direction: 'up' | 'down' }
  | { type: 'SELECT_SEGMENT'; index: number | null }

function reorder(segments: Segment[]): Segment[] {
  return segments.map((s, i) => ({ ...s, order: i }))
}

function reducer(state: EditorState, action: Action): EditorState {
  switch (action.type) {
    case 'SET_SEGMENTS':
      return { segments: reorder(action.segments), selectedIndex: null, isDirty: false }

    case 'ADD_SEGMENT': {
      if (state.segments.length >= 10) return state
      const seg: Segment = { start: action.start, end: action.end, order: state.segments.length }
      return { ...state, segments: reorder([...state.segments, seg]), isDirty: true }
    }

    case 'DELETE_SEGMENT': {
      if (state.segments.length <= 1) return state
      const filtered = state.segments.filter((_, i) => i !== action.index)
      return { ...state, segments: reorder(filtered), selectedIndex: null, isDirty: true }
    }

    case 'RESIZE_SEGMENT': {
      const updated = state.segments.map((s, i) =>
        i === action.index ? { ...s, start: action.start, end: action.end } : s
      )
      return { ...state, segments: updated, isDirty: true }
    }

    case 'MOVE_SEGMENT': {
      const updated = state.segments.map((s, i) =>
        i === action.index ? { ...s, start: action.start, end: action.end } : s
      )
      return { ...state, segments: updated, isDirty: true }
    }

    case 'REORDER_SEGMENT': {
      const { index, direction } = action
      const target = direction === 'up' ? index - 1 : index + 1
      if (target < 0 || target >= state.segments.length) return state
      const arr = [...state.segments]
      const a = arr[index]!
      const b = arr[target]!
      ;[arr[index], arr[target]] = [b, a]
      return { ...state, segments: reorder(arr), isDirty: true }
    }

    case 'SELECT_SEGMENT':
      return { ...state, selectedIndex: action.index }

    default:
      return state
  }
}

export function useEditorState(initialSegments: Segment[]) {
  const [state, dispatch] = useReducer(reducer, {
    segments: reorder(initialSegments),
    selectedIndex: null,
    isDirty: false,
  })

  const isDirtyRef = useRef(state.isDirty)
  isDirtyRef.current = state.isDirty

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirtyRef.current) {
        e.preventDefault()
      }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [])

  const totalDuration = state.segments.reduce((sum, s) => sum + (s.end - s.start), 0)

  const hasOverlap = useCallback(() => {
    const sorted = [...state.segments].sort((a, b) => a.start - b.start)
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i]!.start < sorted[i - 1]!.end) return true
    }
    return false
  }, [state.segments])

  const canExport = totalDuration >= 3 && !hasOverlap() && state.segments.length > 0

  return { state, dispatch, totalDuration, canExport, hasOverlap }
}

export function parseSegments(
  raw: unknown,
  fallbackStart?: number,
  fallbackEnd?: number
): Segment[] {
  if (Array.isArray(raw) && raw.length > 0) {
    return raw
      .filter((s: any) => typeof s.start === 'number' && typeof s.end === 'number' && s.end > s.start)
      .map((s: any, i: number) => ({ start: s.start, end: s.end, order: s.order ?? i }))
  }
  if (typeof fallbackStart === 'number' && typeof fallbackEnd === 'number') {
    return [{ start: fallbackStart, end: fallbackEnd, order: 0 }]
  }
  return []
}
