'use client'

import { useAuth } from '@/components/auth/use-auth'
import { authClient } from '@/lib/auth'
import { useEffect, useRef, useState } from 'react'
import { type StudioProject, createStudioClient } from './studio-client'
import { configuredStudioOrigin } from './studio-config'
import { startStudioSessionRenewal } from './studio-session-renewal'

const origin = configuredStudioOrigin(
  process.env.NEXT_PUBLIC_STUDIO_URL,
  process.env.NODE_ENV === 'production'
)
const lastProjectKey = (user: string) => `sneepcut:studio:last:${user}`

function rememberProject(user: string, projectId: string) {
  try {
    localStorage.setItem(lastProjectKey(user), projectId)
  } catch {
    /* Browser storage may be disabled; the workspace still opens. */
  }
}

export function useStudioWorkspace(initialClipId?: string, initialProjectId?: string) {
  const session = useAuth()
  const userId = session.user?.id
  const [api] = useState(() => (origin ? createStudioClient(origin, authClient) : null))
  const [state, setState] = useState<{
    user: string
    projects: StudioProject[]
    active: StudioProject
  } | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const opening = useRef<AbortController | null>(null)
  const visible = state?.user === userId ? state : null

  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt requests reconnection.
  useEffect(() => {
    if (!api || !userId || session.status !== 'authenticated') return
    const controller = new AbortController()
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(150000)])
    opening.current?.abort()
    opening.current = null
    setBusy(null)
    setState(null)
    setError('')
    void (async () => {
      await api.connect(signal)
      const projects = await api.projects(signal)
      const requestedProject = initialProjectId
        ? projects.find((project) => project.id === initialProjectId)
        : undefined
      if (initialProjectId && !requestedProject) throw new Error('The requested Studio project is unavailable for this account.')
      let saved: string | null = null
      try {
        saved = localStorage.getItem(lastProjectKey(userId))
      } catch {
        /* Browser storage may be disabled; the workspace still opens. */
      }
      const active = initialClipId
        ? await api.openClip(initialClipId, signal)
        : (requestedProject ?? projects.find((project) => project.id === saved) ??
          projects[0] ??
          (await api.workspace(signal)))
      if (!controller.signal.aborted) {
        setState({
          user: userId,
          projects: [active, ...projects.filter((project) => project.id !== active.id)],
          active
        })
        rememberProject(userId, active.id)
      }
    })().catch((cause) => {
      if (!controller.signal.aborted)
        setError(cause instanceof Error ? cause.message : 'Could not open Studio.')
    })
    return () => {
      controller.abort()
      opening.current?.abort()
      opening.current = null
    }
  }, [api, userId, session.status, attempt, initialClipId, initialProjectId])

  const connectedUser = visible?.user
  useEffect(() => {
    if (!api || !userId || connectedUser !== userId) return
    const renewal = startStudioSessionRenewal(
      async (signal) => {
        const token = await authClient.refresh()
        if (signal.aborted) return
        if (!token || authClient.getSnapshot().user?.id !== userId)
          throw new Error('Your sign-in changed. Reconnect to continue.')
        await api.connect(AbortSignal.any([signal, AbortSignal.timeout(15000)]))
      },
      (cause) => {
        setError(cause instanceof Error ? cause.message : 'Reconnect to Studio to continue.')
      }
    )
    const resume = () => {
      if (document.visibilityState === 'visible') void renewal.renewNow()
    }
    document.addEventListener('visibilitychange', resume)
    return () => {
      document.removeEventListener('visibilitychange', resume)
      renewal.stop()
    }
  }, [api, connectedUser, userId])

  function select(project: StudioProject) {
    if (!userId || authClient.getSnapshot().user?.id !== userId) return
    setState((previous) =>
      previous?.user === userId
        ? {
            ...previous,
            active: project,
            projects: [project, ...previous.projects.filter((item) => item.id !== project.id)]
          }
        : previous
    )
    rememberProject(userId, project.id)
  }
  async function open(id?: string, title = 'Untitled project') {
    if (!api || opening.current || !visible) return
    const controller = new AbortController()
    opening.current = controller
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(150000)])
    setBusy(id ?? 'new')
    setError('')
    await (id ? api.openClip(id, signal) : api.create(title, signal))
      .then((project) => {
        if (!controller.signal.aborted) select(project)
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setError(cause instanceof Error ? cause.message : 'Could not open your clip.')
      })
      .finally(() => {
        if (opening.current === controller) {
          opening.current = null
          setBusy(null)
        }
      })
  }
  async function reconnect() {
    if (!visible || !api) {
      setAttempt((value) => value + 1)
      return
    }
    if (opening.current) return
    const controller = new AbortController()
    opening.current = controller
    setBusy('reconnect')
    await api
      .connect(AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]))
      .then(() => {
        if (!controller.signal.aborted) setError('')
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setError(cause instanceof Error ? cause.message : 'Could not reconnect to Studio.')
      })
      .finally(() => {
        if (opening.current === controller) {
          opening.current = null
          setBusy(null)
        }
      })
  }
  return {
    origin,
    session,
    active: visible?.active,
    projects: visible?.projects ?? [],
    error,
    busy,
    select,
    open,
    reconnect
  }
}
