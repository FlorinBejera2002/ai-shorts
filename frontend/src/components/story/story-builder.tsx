import { useCallback, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'next/navigation'
import { authClient } from '@/lib/auth'
import { StoryProjectHeader } from './story-project-controls'
import type { RejectedSource } from './story-source-model'
import { StoryErrorAlert } from './story-error-alert'
import { savedProject, rememberProject } from './story-builder-storage'
import { StoryProjectView } from './story-project-view'
import { storyIsBusy } from './types'
import { useRequestedStoryLink } from './use-requested-story-link'
import {
  useStoryProjectCreation,
  type StoryIncomingProject
} from './use-story-project-creation'
import { useStoryProjectQuery } from './use-story-project-query'

/** Creare clip entry point: shows the selected project or the new-project wizard. */
export function StoryBuilder() {
  const queryClient = useQueryClient()
  const params = useSearchParams()
  const userID = authClient.getSnapshot().user?.id ?? ''
  const storageKey = `sneepcut:story:${userID}`
  const requestedID = params.get('story')
  const [id, setID] = useState(() => requestedID || savedProject(storageKey))
  const [incoming, setIncoming] = useState<StoryIncomingProject | null>(null)
  const [uploading, setUploading] = useState(false)
  const [unsavedChanges, setUnsavedChanges] = useState(false)
  const [error, setError] = useState('')
  const [retainedFiles, setRetainedFiles] = useState<File[]>([])
  const [refused, setRefused] = useState<RejectedSource[]>([])
  const createID = useRef(crypto.randomUUID())
  const { projectQuery, limits, refresh } = useStoryProjectQuery(userID, id)
  const { creating, createProject } = useStoryProjectCreation({
    userID,
    limits,
    createID,
    setID,
    setIncoming,
    setError,
    setRetainedFiles
  })

  useEffect(() => {
    rememberProject(storageKey, id)
    createID.current = crypto.randomUUID()
  }, [storageKey, id])

  const switchingDisabled =
    creating ||
    uploading ||
    unsavedChanges ||
    storyIsBusy(projectQuery.data?.status)

  const selectProject = useCallback((value: string) => {
    setID(value)
    setIncoming(null)
    setError('')
    setRetainedFiles([])
    setRefused([])
    createID.current = crypto.randomUUID()
  }, [])

  useRequestedStoryLink({
    requestedID,
    currentID: id,
    switchingLocked: switchingDisabled,
    openProject: (value) => {
      setID(value)
      setIncoming(null)
      setError('')
      setRetainedFiles([])
    }
  })

  function handleDeleted() {
    selectProject('')
    void queryClient.invalidateQueries({ queryKey: ['stories', userID] })
  }

  return (
    <div className="story-workspace w-full space-y-5">
      {Boolean(projectQuery.data?.current_version) && (
        <StoryProjectHeader
          unsavedChanges={unsavedChanges}
          disabled={switchingDisabled}
          onNewProject={() => selectProject('')}
        />
      )}
      {error && <StoryErrorAlert message={error} />}
      <StoryProjectView
        id={id}
        projectQuery={projectQuery}
        limits={limits}
        creating={creating}
        retainedFiles={retainedFiles}
        refused={refused}
        onRefusedChange={setRefused}
        incoming={incoming}
        onAddFiles={(files) => void createProject(files)}
        onContinue={() => void createProject(retainedFiles, 1)}
        refresh={refresh}
        onUploadBusy={setUploading}
        onUnsavedChanges={setUnsavedChanges}
        onDeleted={handleDeleted}
      />
    </div>
  )
}
