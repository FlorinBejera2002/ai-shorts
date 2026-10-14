import { useCallback, useEffect, useReducer } from 'react'
import { api } from '../api'
import { routesEqual, supportsStage, type ModelRoute, type RoutingConfiguration } from './types'

type State = {
  configuration: RoutingConfiguration | null
  draft: Record<string, ModelRoute>
  reason: string
  status: 'loading' | 'ready' | 'saving'
  error: string
  requiresReload: boolean
  saved: boolean
}

type Action =
  | { type: 'loading' | 'saving' | 'reset' }
  | { type: 'loaded'; configuration: RoutingConfiguration; saved?: boolean }
  | { type: 'failed'; message: string; requiresReload?: boolean }
  | { type: 'reason'; reason: string }
  | { type: 'route'; stage: string; route: ModelRoute }

const initialState: State = {
  configuration: null, draft: {}, reason: '', status: 'loading', error: '', requiresReload: false, saved: false
}

function draftsFor(configuration: RoutingConfiguration) {
  return Object.fromEntries(configuration.routes.map(({ stage, provider, model }) => [stage, { provider, model }]))
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'loading': return { ...state, status: 'loading', error: '' }
    case 'saving': return { ...state, status: 'saving', error: '', saved: false }
    case 'loaded': return {
      ...initialState, status: 'ready', configuration: action.configuration,
      draft: draftsFor(action.configuration), saved: action.saved ?? false
    }
    case 'failed': return {
      ...state, status: 'ready', error: action.message,
      requiresReload: action.requiresReload ?? state.requiresReload
    }
    case 'reason': return { ...state, reason: action.reason, saved: false }
    case 'route': return { ...state, draft: { ...state.draft, [action.stage]: action.route }, saved: false }
    case 'reset': return state.configuration
      ? { ...state, draft: draftsFor(state.configuration), reason: '', saved: false }
      : state
  }
}

function statusOf(error: unknown) {
  return error instanceof Error && 'status' in error ? error.status : undefined
}

function errorMessage(error: unknown) {
  if (statusOf(error) === 403) {
    return 'Salvarea cere o autentificare administrativă recentă. Reautentifică-te și verifică accesul de administrator. Selecțiile sunt păstrate în această pagină.'
  }
  if (statusOf(error) === 401) return 'Sesiunea a expirat. Reautentifică-te pentru a continua.'
  return error instanceof Error ? error.message : 'Configurația AI nu a putut fi încărcată.'
}

export function useAiRouting() {
  const [state, dispatch] = useReducer(reducer, initialState)
  const load = useCallback(async (signal?: AbortSignal) => {
    dispatch({ type: 'loading' })
    try {
      const configuration = await api.request<RoutingConfiguration>('/api/admin/ai-routing', { signal })
      if (!signal?.aborted) dispatch({ type: 'loaded', configuration })
    } catch (error) {
      if (!signal?.aborted) dispatch({ type: 'failed', message: errorMessage(error) })
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load])

  const { configuration, draft, reason, status, requiresReload } = state
  const changedCount = configuration?.routes.filter((stage) => !routesEqual(stage, draft[stage.stage])).length ?? 0
  const validRoutes = !!configuration && configuration.routes.every((stage) => {
    const route = draft[stage.stage]
    return configuration.providers.some((provider) => provider.id === route.provider && provider.configured)
      && configuration.models.some((model) => model.provider === route.provider && model.id === route.model && supportsStage(model, stage))
  })
  const validReason = reason.trim().length >= 5 && reason.trim().length <= 500
  const canSave = status === 'ready' && changedCount > 0 && validRoutes && validReason
    && !configuration?.catalogUnavailable && !requiresReload

  async function save() {
    if (!configuration || !canSave) return
    dispatch({ type: 'saving' })
    try {
      await api.request('/api/admin/ai-routing', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: configuration.version, routes: draft, reason: reason.trim() })
      })
    } catch (error) {
      const conflict = statusOf(error) === 409
      dispatch({
        type: 'failed', requiresReload: conflict,
        message: conflict
          ? 'Configurația a fost modificată de alt administrator. Selecțiile tale sunt păstrate. Reîncarcă versiunea curentă înainte de a aplica din nou modificările.'
          : errorMessage(error)
      })
      return
    }
    try {
      const configuration = await api.request<RoutingConfiguration>('/api/admin/ai-routing')
      dispatch({ type: 'loaded', configuration, saved: true })
    } catch {
      dispatch({
        type: 'failed', requiresReload: true,
        message: 'Modificarea a fost salvată, dar configurația curentă nu a putut fi confirmată. Reîncarcă versiunea de pe server înainte de o nouă modificare.'
      })
    }
  }

  return {
    ...state, changedCount, validRoutes, canSave,
    reload: () => load(), save,
    setReason: (reason: string) => dispatch({ type: 'reason', reason }),
    setRoute: (stage: string, route: ModelRoute) => dispatch({ type: 'route', stage, route }),
    reset: () => dispatch({ type: 'reset' })
  }
}
