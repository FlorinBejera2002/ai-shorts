'use client'

import { useCallback, useEffect, useReducer, useRef } from 'react'

export interface Segment {
  start: number
  end: number
  order: number
}

export const MAX_SEGMENTS = 10
export const MIN_SEGMENT_DURATION = 0.25
export const MIN_TOTAL_DURATION = 3

const HISTORY_LIMIT = 50

interface EditorState {
  segments: Segment[]
  selectedIndex: number | null
  isDirty: boolean
  past: Segment[][]
  future: Segment[][]
}

type Action =
  | { type: 'SET_SEGMENTS'; segments: Segment[] }
  | { type: 'ADD_SEGMENT'; start: number; end: number }
  | { type: 'DELETE_SEGMENT'; index: number }
  /** Transient drag update — history snapshot is taken once via BEGIN_DRAG. */
  | { type: 'RESIZE_SEGMENT'; index: number; start: number; end: number }
  | { type: 'MOVE_SEGMENT'; index: number; start: number; end: number }
  | { type: 'BEGIN_DRAG' }
  | { type: 'REORDER_SEGMENT'; index: number; direction: 'up' | 'down' }
  | { type: 'SET_TIMES'; index: number; start: number; end: number }
  | { type: 'SPLIT_AT'; time: number }
  /** Replace the whole list (AI assistant) — undoable via history. */
  | { type: 'APPLY_SEGMENTS'; segments: { start: number; end: number }[] }
  | { type: 'SELECT_SEGMENT'; index: number | null }
  | { type: 'UNDO' }
  | { type: 'REDO' }
  | { type: 'MARK_SAVED' }

function reorder(segments: Segment[]): Segment[] {
  return segments.map((s, i) => ({ ...s, order: i }))
}

function pushHistory(state: EditorState): Pick<EditorState, 'past' | 'future'> {
  return {
    past: [...state.past.slice(-(HISTORY_LIMIT - 1)), state.segments],
    future: []
  }
}

function clampSelection(
  index: number | null,
  segments: Segment[]
): number | null {
  if (index === null || index >= segments.length) return null
  return index
}

function reducer(state: EditorState, action: Action): EditorState {
  switch (action.type) {
    case 'SET_SEGMENTS':
      return {
        segments: reorder(action.segments),
        selectedIndex: null,
        isDirty: false,
        past: [],
        future: []
      }

    case 'ADD_SEGMENT': {
      if (state.segments.length >= MAX_SEGMENTS) return state
      const seg: Segment = {
        start: action.start,
        end: action.end,
        order: state.segments.length
      }
      const segments = reorder([...state.segments, seg])
      return {
        ...state,
        ...pushHistory(state),
        segments,
        selectedIndex: segments.length - 1,
        isDirty: true
      }
    }

    case 'DELETE_SEGMENT': {
      if (state.segments.length <= 1) return state
      const filtered = state.segments.filter((_, i) => i !== action.index)
      return {
        ...state,
        ...pushHistory(state),
        segments: reorder(filtered),
        selectedIndex: null,
        isDirty: true
      }
    }

    case 'BEGIN_DRAG':
      return { ...state, ...pushHistory(state) }

    case 'RESIZE_SEGMENT':
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
      return {
        ...state,
        ...pushHistory(state),
        segments: reorder(arr),
        selectedIndex: target,
        isDirty: true
      }
    }

    case 'SET_TIMES': {
      const seg = state.segments[action.index]
      if (!seg) return state
      const start = Math.max(0, action.start)
      const end = Math.max(start + MIN_SEGMENT_DURATION, action.end)
      if (seg.start === start && seg.end === end) return state
      const updated = state.segments.map((s, i) =>
        i === action.index ? { ...s, start, end } : s
      )
      return {
        ...state,
        ...pushHistory(state),
        segments: updated,
        isDirty: true
      }
    }

    case 'SPLIT_AT': {
      if (state.segments.length >= MAX_SEGMENTS) return state
      const index = state.segments.findIndex(
        (s) =>
          action.time >= s.start + MIN_SEGMENT_DURATION &&
          action.time <= s.end - MIN_SEGMENT_DURATION
      )
      if (index === -1) return state
      const seg = state.segments[index]!
      const left: Segment = { ...seg, end: action.time }
      const right: Segment = { ...seg, start: action.time }
      const segments = [...state.segments]
      segments.splice(index, 1, left, right)
      return {
        ...state,
        ...pushHistory(state),
        segments: reorder(segments),
        selectedIndex: index + 1,
        isDirty: true
      }
    }

    case 'APPLY_SEGMENTS': {
      const cleaned = action.segments
        .filter(
          (s) =>
            Number.isFinite(s.start) &&
            Number.isFinite(s.end) &&
            s.end - s.start >= MIN_SEGMENT_DURATION
        )
        .slice(0, MAX_SEGMENTS)
      if (cleaned.length === 0) return state
      return {
        ...state,
        ...pushHistory(state),
        segments: reorder(
          cleaned.map((s, i) => ({ start: s.start, end: s.end, order: i }))
        ),
        selectedIndex: null,
        isDirty: true
      }
    }

    case 'SELECT_SEGMENT':
      return { ...state, selectedIndex: action.index }

    case 'UNDO': {
      const previous = state.past[state.past.length - 1]
      if (!previous) return state
      return {
        ...state,
        segments: previous,
        selectedIndex: clampSelection(state.selectedIndex, previous),
        past: state.past.slice(0, -1),
        future: [state.segments, ...state.future],
        isDirty: true
      }
    }

    case 'REDO': {
      const next = state.future[0]
      if (!next) return state
      return {
        ...state,
        segments: next,
        selectedIndex: clampSelection(state.selectedIndex, next),
        past: [...state.past, state.segments],
        future: state.future.slice(1),
        isDirty: true
      }
    }

    case 'MARK_SAVED':
      return { ...state, isDirty: false }

    default:
      return state
  }
}

export function useEditorState(initialSegments: Segment[]) {
  const [state, dispatch] = useReducer(reducer, {
    segments: reorder(initialSegments),
    selectedIndex: null,
    isDirty: false,
    past: [],
    future: []
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

  const totalDuration = state.segments.reduce(
    (sum, s) => sum + (s.end - s.start),
    0
  )

  const hasOverlap = useCallback(() => {
    const sorted = [...state.segments].sort((a, b) => a.start - b.start)
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i]!.start < sorted[i - 1]!.end) return true
    }
    return false
  }, [state.segments])

  const canExport =
    totalDuration >= MIN_TOTAL_DURATION &&
    !hasOverlap() &&
    state.segments.length > 0

  const canUndo = state.past.length > 0
  const canRedo = state.future.length > 0

  return {
    state,
    dispatch,
    totalDuration,
    canExport,
    hasOverlap,
    canUndo,
    canRedo
  }
}

export function parseSegments(
  raw: unknown,
  fallbackStart?: number,
  fallbackEnd?: number
): Segment[] {
  if (Array.isArray(raw) && raw.length > 0) {
    return raw
      .filter(
        (s: { start?: unknown; end?: unknown }) =>
          typeof s.start === 'number' &&
          typeof s.end === 'number' &&
          s.end > s.start
      )
      .map((s: { start?: unknown; end?: unknown; order?: unknown }, i: number) => ({
        start: s.start as number,
        end: s.end as number,
        order: typeof s.order === 'number' ? s.order : i
      }))
  }
  if (typeof fallbackStart === 'number' && typeof fallbackEnd === 'number') {
    return [{ start: fallbackStart, end: fallbackEnd, order: 0 }]
  }
  return []
}
