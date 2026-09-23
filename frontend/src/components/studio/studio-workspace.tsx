'use client'

import { Button } from '@/components/ui/button'
import { Link } from '@/i18n/navigation'
import { ArrowLeft, ExternalLink, Maximize2, PanelLeft, RefreshCw, Sparkles } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { clearStudioSelection, publishStudioSelection } from '@/components/workspace-agent/studio-selection'
import { StudioAssistant } from './studio-assistant'
import type { StudioProject } from './studio-client'

export function StudioWorkspace({
  origin,
  project,
  onBack,
  onReconnect,
  library,
  libraryOpen = false,
  notice,
  error
}: {
  origin: string
  project: StudioProject
  onBack(): void
  onReconnect(): void
  library?: ReactNode
  libraryOpen?: boolean
  notice?: string
  error?: string
}) {
  const t = useTranslations('studioWorkspace')
  const workspace = useRef<HTMLDivElement>(null)
  const frame = useRef<HTMLIFrameElement>(null)
  useEffect(() => {
    function receive(event: MessageEvent) {
      if (event.source !== frame.current?.contentWindow || event.origin !== origin || event.data?.projectId !== project.id) return
      if (event.data.type === 'sneepcut:agent-selection-ready') { frame.current?.contentWindow?.postMessage({ type: 'sneepcut:agent-selection-connect', projectId: project.id }, origin); return }
      if (event.data.type !== 'sneepcut:agent-selection') return
      publishStudioSelection(project.id, event.data.ids)
    }
    window.addEventListener('message', receive)
    return () => { window.removeEventListener('message', receive); clearStudioSelection(project.id) }
  }, [origin, project.id])
  const [loaded, setLoaded] = useState(false)
  const [frameError, setFrameError] = useState('')
  const [assistantOpen, setAssistantOpen] = useState(false)
  const url = `${origin}/#project/${encodeURIComponent(project.id)}`

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else if (workspace.current?.requestFullscreen) await workspace.current.requestFullscreen()
      else setFrameError(t('fullscreenError'))
    } catch {
      setFrameError(t('fullscreenError'))
    }
  }

  return (
    <div className="min-w-0 space-y-4">
      <Button asChild variant="ghost" size="sm">
        <Link href="/dashboard/studio">
          <ArrowLeft aria-hidden="true" />
          {t('backToLibrary')}
        </Link>
      </Button>
      <div
        ref={workspace}
        className="flex h-[calc(100dvh-11rem)] min-h-[540px] flex-col overflow-hidden rounded-md border bg-background fullscreen:h-dvh fullscreen:rounded-none"
      >
        <div className="flex flex-wrap items-center gap-2 border-b bg-card p-3">
          <Button
            variant="outline"
            size="sm"
            onClick={onBack}
            aria-expanded={libraryOpen}
            aria-controls="studio-library"
          >
            <PanelLeft aria-hidden="true" />
            {t('library')}
          </Button>
          <div className="min-w-0 flex-1 px-2">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Studio
            </p>
            <h1 className="truncate text-sm font-semibold">{project.title}</h1>
          </div>
          <Button variant="ghost" size="sm" onClick={() => void toggleFullscreen()}>
            <Maximize2 aria-hidden="true" />
            <span className="sr-only sm:not-sr-only">{t('fullscreen')}</span>
          </Button>
          <Button asChild variant="outline" size="sm">
            <a href={url} target="_blank" rel="noopener noreferrer">
              <ExternalLink aria-hidden="true" />
              <span className="sr-only sm:not-sr-only">{t('openTab')}</span>
            </a>
          </Button>
          <Button
            variant={assistantOpen ? 'default' : 'outline'}
            size="sm"
            aria-expanded={assistantOpen}
            aria-controls="studio-assistant"
            onClick={() => setAssistantOpen((value) => !value)}
          >
            <Sparkles aria-hidden="true" />
            {t('assistant')}
          </Button>
        </div>
        {(error || frameError) && (
          <div
            role="alert"
            className="flex items-center justify-between gap-3 border-b px-4 py-2 text-sm"
          >
            <p className="text-destructive">{error || frameError}</p>
            <Button variant="outline" size="sm" onClick={onReconnect}>
              <RefreshCw aria-hidden="true" />
              {t('reconnect')}
            </Button>
          </div>
        )}
        {notice && (
          <p role="status" className="border-b px-4 py-2 text-sm text-muted-foreground">
            {notice}
          </p>
        )}
        {!loaded && (
          <p role="status" className="px-4 py-2 text-sm text-muted-foreground">
            {t('loadingEditor')}
          </p>
        )}
        <div className="flex min-h-0 flex-1 flex-col overflow-auto lg:flex-row">
          {library}
          <iframe
            ref={frame}
            title={`SneepCut Studio — ${project.title}`}
            src={url}
            className="min-h-[360px] min-w-0 flex-1 border-0 bg-background"
            allow="fullscreen; clipboard-write"
            onLoad={() => { setLoaded(true); frame.current?.contentWindow?.postMessage({ type: 'sneepcut:agent-selection-connect', projectId: project.id }, origin) }}
            onError={() => setFrameError(t('loadError'))}
          />
          {assistantOpen && (
            <StudioAssistant key={project.id} origin={origin} projectId={project.id} />
          )}
        </div>
      </div>
    </div>
  )
}
