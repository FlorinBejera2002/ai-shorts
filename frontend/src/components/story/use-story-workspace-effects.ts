import { useEffect, useRef } from 'react'
import type { StoryUploads } from './story-workspace-model'

interface StoryWorkspaceEffectsOptions {
  /** Footage handed over from the wizard; seeded into the uploads once. */
  initialFiles: File[]
  addUploads: StoryUploads['add']
  mediaPending: boolean
  busy: boolean
  optionsChanged: boolean
  onUploadBusy: (busy: boolean) => void
  onUnsavedChanges: (unsaved: boolean) => void
}

/** Reports workspace activity to the builder and warns before leaving with unsaved work. */
export function useStoryWorkspaceEffects({
  initialFiles,
  addUploads,
  mediaPending,
  busy,
  optionsChanged,
  onUploadBusy,
  onUnsavedChanges
}: StoryWorkspaceEffectsOptions) {
  const seeded = useRef(false)

  useEffect(() => {
    if (!seeded.current && initialFiles.length > 0) {
      seeded.current = true
      addUploads(initialFiles)
    }
  }, [initialFiles, addUploads])
  useEffect(() => {
    onUploadBusy(mediaPending || busy)
    return () => onUploadBusy(false)
  }, [mediaPending, busy, onUploadBusy])
  useEffect(() => {
    onUnsavedChanges(optionsChanged)
    return () => onUnsavedChanges(false)
  }, [optionsChanged, onUnsavedChanges])
  useEffect(() => {
    if (!mediaPending && !optionsChanged && !busy) return
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [mediaPending, optionsChanged, busy])
}
