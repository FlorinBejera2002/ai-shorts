'use client'

import { useAuth } from '@/components/auth/use-auth'
import { authClient } from '@/lib/auth'
import { useEffect, useState } from 'react'
import { type StudioProject, createStudioClient } from './studio-client'
import { configuredStudioOrigin } from './studio-config'
import { startStudioSessionRenewal } from './studio-session-renewal'

const origin = configuredStudioOrigin(
  process.env.NEXT_PUBLIC_STUDIO_URL,
  process.env.NODE_ENV === 'production'
)
const lastProjectKey = (user: string) => `sneepcut:studio:last:${user}`

export function useStudioWorkspace() {
  const session = useAuth()
  const userId = session.user?.id
  const [api] = useState(() =>
    origin ? createStudioClient(origin, authClient) : null
  )
  const [state, setState] = useState<{
    user: string
    projects: StudioProject[]
    active: StudioProject
  } | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const visible = state?.user === userId ? state : null

  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt requests reconnection.
  useEffect(() => {
    if (!api || !userId || session.status !== 'authenticated') return
    const controller = new AbortController()
    setState(null)
    setError('')
    void (async () => {
      await api.connect(controller.signal)
      const projects = await api.projects(controller.signal)
      let saved: string | null = null
      try {
        saved = localStorage.getItem(lastProjectKey(userId))
      } catch {
        /* Browser storage may be disabled; the workspace still opens. */
      }
      const active =
        projects.find((project) => project.id === saved) ??
        projects[0] ??
        (await api.workspace(controller.signal))
      if (!controller.signal.aborted)
        setState({
          user: userId,
          projects: projects.length ? projects : [active],
          active
        })
    })().catch((cause) => {
      if (!controller.signal.aborted)
        setError(
          cause instanceof Error ? cause.message : 'Could not open Studio.'
        )
    })
    return () => controller.abort()
  }, [api, userId, session.status, attempt])

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
        setState(null)
        setError(
          cause instanceof Error
            ? cause.message
            : 'Reconnect to Studio to continue.'
        )
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
            projects: [
              project,
              ...previous.projects.filter((item) => item.id !== project.id)
            ]
          }
        : previous
    )
    try {
      localStorage.setItem(lastProjectKey(userId), project.id)
    } catch {
      /* Browser storage may be disabled; the workspace still opens. */
    }
  }
  async function open(id?: string) {
    if (!api || busy || !visible) return
    setBusy(id ?? 'new')
    setError('')
    try {
      select(id ? await api.openClip(id) : await api.create('Untitled project'))
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Could not open your clip.'
      )
    } finally {
      setBusy(null)
    }
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
    reconnect: () => setAttempt((value) => value + 1)
  }
}
