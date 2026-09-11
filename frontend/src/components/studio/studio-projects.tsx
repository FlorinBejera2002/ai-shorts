'use client'

import { useAuth } from '@/components/auth/use-auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PageHeader } from '@/components/ui/page-header'
import { authClient } from '@/lib/auth'
import { ArrowUpRight, Film, Loader2, Plus, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { type StudioProject, createStudioClient } from './studio-client'
import { configuredStudioOrigin } from './studio-config'
import { startStudioSessionRenewal } from './studio-session-renewal'
import { StudioWorkspace } from './studio-workspace'

const configuredOrigin = configuredStudioOrigin(
  process.env.NEXT_PUBLIC_STUDIO_URL,
  process.env.NODE_ENV === 'production'
)

export function StudioProjects() {
  const session = useAuth()
  const [client] = useState(() => {
    if (!configuredOrigin) return { api: null, error: '' }
    try {
      return {
        api: createStudioClient(configuredOrigin, authClient),
        error: ''
      }
    } catch {
      return {
        api: null,
        error:
          'Studio has an invalid service address. Contact your administrator.'
      }
    }
  })
  const [projects, setProjects] = useState<StudioProject[]>([])
  const [active, setActive] = useState<StudioProject | null>(null)
  const [title, setTitle] = useState('')
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [connectedUser, setConnectedUser] = useState<string | null>(null)
  const userId = session.user?.id
  const visibleProjects = connectedUser === userId ? projects : []

  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt explicitly retries the connection.
  useEffect(() => {
    if (!client.api || !userId || session.status !== 'authenticated') return
    const controller = new AbortController()
    const api = client.api
    setLoading(true)
    setError('')
    setActive(null)
    setConnectedUser(null)
    void api
      .connect(controller.signal)
      .then(() => api.projects(controller.signal))
      .then((items) => {
        if (!controller.signal.aborted) {
          setProjects(items)
          setConnectedUser(userId)
        }
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error
              ? cause.message
              : 'Unable to reach Studio. Please reconnect.'
          )
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [client, userId, session.status, attempt])

  useEffect(() => {
    const api = client.api
    if (
      !api ||
      !userId ||
      connectedUser !== userId ||
      session.status !== 'authenticated'
    )
      return
    const renewal = startStudioSessionRenewal(
      async (signal) => {
        const token = await authClient.refresh()
        if (signal.aborted) return
        const current = authClient.getSnapshot()
        if (
          !token ||
          current.status !== 'authenticated' ||
          current.user?.id !== userId
        ) {
          throw new Error(
            'Your sign-in changed. Reconnect to Studio to continue.'
          )
        }
        await api.connect(AbortSignal.any([signal, AbortSignal.timeout(15000)]))
      },
      (cause) => {
        setConnectedUser(null)
        setError(
          cause instanceof Error
            ? cause.message
            : 'Studio session renewal failed. Reconnect to continue.'
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
  }, [client, connectedUser, userId, session.status])

  async function createProject(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!client.api || creating) return
    setCreating(true)
    setError('')
    try {
      const item = await client.api.create(title)
      if (authClient.getSnapshot().user?.id !== userId) return
      setProjects((previous) => [item, ...previous])
      setTitle('')
      setActive(item)
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Could not create your project.'
      )
    } finally {
      setCreating(false)
    }
  }

  if (session.status !== 'authenticated')
    return <p role="status">Checking your session…</p>
  if (!configuredOrigin)
    return (
      <div className="dashboard-workspace">
        <PageHeader
          title="SneepCut Studio"
          description="Your creative workspace"
        />
        <section className="rounded-2xl border bg-card p-6 sm:p-8">
          <h2 className="text-xl font-semibold">Studio is not available yet</h2>
          <p role="status" className="mt-3 text-sm text-muted-foreground">
            Studio is being prepared for this site. You can continue working
            with your clips from the dashboard.
          </p>
        </section>
      </div>
    )
  if (active && client.api && connectedUser === userId)
    return (
      <StudioWorkspace
        origin={client.api.origin}
        project={active}
        onBack={() => setActive(null)}
      />
    )
  return (
    <div className="dashboard-workspace">
      <PageHeader
        title="SneepCut Studio"
        description="Your footage. Your timeline. Every detail under your control."
      />
      <section className="overflow-hidden rounded-2xl border bg-card">
        <div className="grid gap-8 p-6 sm:p-8 lg:grid-cols-[1fr_360px] lg:items-end">
          <div>
            <p className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Creative workspace
            </p>
            <h2 className="max-w-xl text-3xl font-semibold tracking-tight sm:text-4xl">
              Make the next cut yours.
            </h2>
            <p className="mt-4 max-w-lg text-sm leading-6 text-muted-foreground">
              Build with video, audio, text and animation. Open a project to
              work in the full editor.
            </p>
          </div>
          <form onSubmit={createProject} className="space-y-3">
            <label
              htmlFor="studio-project-title"
              className="text-sm font-medium"
            >
              New project
            </label>
            <Input
              id="studio-project-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Give your next story a name"
              maxLength={120}
              required={true}
              disabled={loading || !client.api || creating}
            />
            <Button
              type="submit"
              disabled={loading || !client.api || creating || !title.trim()}
              className="w-full"
            >
              {creating ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Plus className="size-4" />
              )}{' '}
              {creating ? 'Creating…' : 'Create project'}
            </Button>
          </form>
        </div>
        <div className="flex items-center justify-between border-t bg-muted/30 px-6 py-3 text-xs text-muted-foreground sm:px-8">
          <span>Timeline · Motion · Audio · Export</span>
          <span>SneepCut</span>
        </div>
      </section>
      {(client.error || error) && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 rounded-xl border border-destructive/25 bg-destructive/5 p-4 text-sm"
        >
          <p className="flex-1">{client.error || error}</p>
          {client.api && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAttempt((value) => value + 1)}
            >
              Reconnect
            </Button>
          )}
        </div>
      )}
      <section aria-labelledby="studio-projects-title">
        <div className="mb-4 flex items-center justify-between">
          <h2 id="studio-projects-title" className="text-lg font-semibold">
            Your projects{' '}
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              {visibleProjects.length}
            </span>
          </h2>
          <Button
            variant="ghost"
            size="sm"
            disabled={loading || !client.api}
            onClick={() => setAttempt((value) => value + 1)}
          >
            <RefreshCw className="size-4" /> Refresh
          </Button>
        </div>
        {loading && client.api ? (
          <p
            role="status"
            className="py-12 text-center text-sm text-muted-foreground"
          >
            Connecting to your workspace…
          </p>
        ) : visibleProjects.length ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {visibleProjects.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setActive(item)}
                className="group rounded-xl border bg-card p-5 text-left transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="mb-8 flex items-center justify-between text-muted-foreground">
                  <Film className="size-6" />
                  <ArrowUpRight className="size-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 motion-reduce:transform-none" />
                </div>
                <h3 className="truncate font-semibold">{item.title}</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Open in Studio
                </p>
              </button>
            ))}
          </div>
        ) : (
          !error &&
          !client.error && (
            <div className="rounded-xl border border-dashed py-14 text-center">
              <Film className="mx-auto mb-3 size-7 text-muted-foreground" />
              <p className="font-medium">A fresh timeline starts here.</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Name your first project above to get started.
              </p>
            </div>
          )
        )}
      </section>
    </div>
  )
}
