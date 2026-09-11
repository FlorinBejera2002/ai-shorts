'use client'

import { Button } from '@/components/ui/button'
import { ArrowLeft, ExternalLink, Maximize2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { StudioAssistant } from './studio-assistant'
import type { StudioProject } from './studio-client'

export function StudioWorkspace({
  origin,
  project,
  onBack
}: {
  origin: string
  project: StudioProject
  onBack(): void
}) {
  const workspace = useRef<HTMLDivElement>(null)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const [assistantOpen, setAssistantOpen] = useState(false)
  const url = `${origin}/#project/${encodeURIComponent(project.id)}`
  return (
    <div
      ref={workspace}
      className="flex h-[calc(100dvh-8rem)] min-h-[480px] flex-col overflow-hidden rounded-xl border bg-background fullscreen:h-dvh fullscreen:rounded-none"
    >
      <div className="flex flex-wrap items-center gap-3 border-b px-3 py-2">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="size-4" /> Projects
        </Button>
        <h1 className="min-w-0 flex-1 truncate text-sm font-semibold">
          {project.title}
        </h1>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            if (!workspace.current?.requestFullscreen) {
              setError('Fullscreen is not supported. Open Studio in a new tab.')
              return
            }
            void workspace.current
              .requestFullscreen()
              .catch(() =>
                setError('Fullscreen was blocked. Open Studio in a new tab.')
              )
          }}
        >
          <Maximize2 className="size-4" />
          <span className="sr-only sm:not-sr-only">Fullscreen</span>
        </Button>
        <Button asChild={true} variant="outline" size="sm">
          <a href={url} target="_blank" rel="noopener noreferrer">
            Open tab <ExternalLink className="size-4" />
          </a>
        </Button>
        <Button
          variant="outline"
          size="sm"
          aria-pressed={assistantOpen}
          onClick={() => setAssistantOpen((value) => !value)}
        >
          AI assistant
        </Button>
      </div>
      {error && (
        <p role="alert" className="px-4 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      {!loaded && (
        <p role="status" className="px-4 py-2 text-sm text-muted-foreground">
          Loading Studio… If it does not appear, open it in a new tab.
        </p>
      )}
      <div className="flex min-h-0 flex-1 flex-col overflow-auto lg:flex-row">
        <iframe
          title={`SneepCut Studio — ${project.title}`}
          src={url}
          className="min-h-[360px] min-w-0 flex-1 border-0 bg-[#0a0a0a]"
          allow="fullscreen; clipboard-write"
          onLoad={() => setLoaded(true)}
          onError={() =>
            setError('Studio could not load. Return to projects and reconnect.')
          }
        />
        {assistantOpen && (
          <StudioAssistant
            key={project.id}
            origin={origin}
            projectId={project.id}
          />
        )}
      </div>
    </div>
  )
}
