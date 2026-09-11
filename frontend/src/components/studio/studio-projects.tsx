'use client'

import { Button } from '@/components/ui/button'
import { useState } from 'react'
import { StudioLibrary } from './studio-library'
import { StudioWorkspace } from './studio-workspace'
import { useStudioWorkspace } from './use-studio-workspace'

export function StudioProjects() {
  const studio = useStudioWorkspace()
  const [libraryOpen, setLibraryOpen] = useState(true)
  if (!studio.origin) return <p role="status">Studio is not available yet.</p>
  if (!studio.active)
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
        <p role={studio.error ? 'alert' : 'status'}>
          {studio.error || 'Opening your Studio…'}
        </p>
        {studio.error && (
          <Button variant="outline" onClick={studio.reconnect}>
            Reconnect
          </Button>
        )}
      </div>
    )
  return (
    <StudioWorkspace
      key={studio.active.id}
      origin={studio.origin}
      project={studio.active}
      onBack={() => setLibraryOpen((value) => !value)}
      libraryOpen={libraryOpen}
      notice={
        studio.error || (studio.busy ? 'Preparing your editable copy…' : '')
      }
      library={
        libraryOpen ? (
          <StudioLibrary
            projects={studio.projects}
            activeId={studio.active.id}
            busy={studio.busy}
            onSelect={studio.select}
            onOpen={(id) => {
              void studio.open(id)
            }}
          />
        ) : null
      }
    />
  )
}
